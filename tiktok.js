import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import Parser from "rss-parser";
import fs from "fs";
import { ids, paths, tiktok } from "./config.js";

const parser = new Parser({
  timeout: 20000,
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; JGStudiosBot/1.3; +https://discord.com)",
    Accept: "application/rss+xml, application/xml, text/xml, */*"
  }
});

let lastPostId = loadLastTikTokPostId();
let isChecking = false;

function logTikTok(message, ...args) {
  if (tiktok.debug) console.log(`[TikTok] ${message}`, ...args);
}

function loadLastTikTokPostId() {
  try {
    if (!fs.existsSync(paths.tiktokStateFile)) return null;
    const data = JSON.parse(fs.readFileSync(paths.tiktokStateFile, "utf8"));
    return data.lastPostId || data.lastPostLink || null;
  } catch (error) {
    console.warn("Could not read TikTok state file:", error.message);
    return null;
  }
}

function saveLastTikTokPost(post) {
  try {
    fs.writeFileSync(
      paths.tiktokStateFile,
      JSON.stringify(
        {
          lastPostId: post.id,
          lastPostLink: post.link,
          title: post.title,
          source: post.source,
          updatedAt: new Date().toISOString()
        },
        null,
        2
      )
    );
  } catch (error) {
    console.warn("Could not save TikTok state file:", error.message);
  }
}

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function normalizeTikTokVideoUrl(link) {
  if (!link) return null;

  const cleaned = String(link)
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .trim();

  const match = cleaned.match(/https?:\/\/(?:www\.)?tiktok\.com\/@[^\s"'<>]+\/video\/\d+/i);
  return match ? match[0].replace("http://", "https://") : cleaned;
}

function getTikTokPostId(link, guid) {
  const source = `${link || ""} ${guid || ""}`;
  const videoId = source.match(/\/video\/(\d+)/)?.[1];
  return videoId || normalizeTikTokVideoUrl(link || guid);
}

function getThumbnail(item) {
  return (
    item.enclosure?.url ||
    item.itunes?.image ||
    item.media?.thumbnail?.[0]?.$?.url ||
    item.media?.content?.[0]?.$?.url ||
    null
  );
}

function feedItemToPost(item, sourceUrl) {
  const link = normalizeTikTokVideoUrl(item.link || item.guid);
  if (!link) return null;

  return {
    id: getTikTokPostId(link, item.guid),
    link,
    title: cleanText(item.title) || "New TikTok Uploaded!",
    content: cleanText(item.contentSnippet || item.content || item.summary),
    date: item.isoDate || item.pubDate || null,
    thumbnail: getThumbnail(item),
    source: sourceUrl
  };
}

function newestFirst(posts) {
  return posts.sort((a, b) => {
    const aTime = a.date ? Date.parse(a.date) : 0;
    const bTime = b.date ? Date.parse(b.date) : 0;
    return bTime - aTime;
  });
}

async function getLatestTikTokFromRss() {
  const urls = tiktok.rssUrls.filter(Boolean);

  if (!urls.length) {
    console.warn("TikTok RSS URL is not configured. Set TIKTOK_RSS_URL or TIKTOK_RSS_URLS in .env.");
    return { post: null, checked: [], errors: ["No TikTok RSS URLs configured."] };
  }

  const checked = [];
  const errors = [];

  for (const rssUrl of urls) {
    try {
      logTikTok(`Checking RSS feed: ${rssUrl}`);
      const feed = await parser.parseURL(rssUrl);
      const posts = newestFirst((feed.items || []).map(item => feedItemToPost(item, rssUrl)).filter(Boolean));
      checked.push(`${rssUrl} (${posts.length} posts)`);

      if (!posts.length) continue;

      logTikTok(`Newest post from feed: ${posts[0].id} ${posts[0].link}`);
      return { post: posts[0], checked, errors };
    } catch (error) {
      const message = `${rssUrl}: ${error.message}`;
      errors.push(message);
      console.warn("TikTok RSS feed failed:", message);
    }
  }

  return { post: null, checked, errors };
}

function buildTikTokMessage(newestPost) {
  const description = newestPost.content || "Click below to watch the newest TikTok from JGraphix Studio.";

  const embed = new EmbedBuilder()
    .setTitle("🎵 New TikTok Uploaded!")
    .setDescription(description.length > 4000 ? `${description.slice(0, 3997)}...` : description)
    .setURL(newestPost.link)
    .setColor("#ff0050")
    .addFields({ name: "▶ Watch TikTok", value: newestPost.link })
    .setFooter({ text: "TikTok upload detected" })
    .setTimestamp(newestPost.date ? new Date(newestPost.date) : new Date());

  if (newestPost.thumbnail) embed.setImage(newestPost.thumbnail);

  const message = { embeds: [embed] };

  if (ids.tiktokRole) {
    message.content = `<@&${ids.tiktokRole}> New TikTok uploaded!`;
    message.allowedMentions = { roles: [ids.tiktokRole] };
  } else {
    message.content = "New TikTok uploaded!";
    message.allowedMentions = { parse: [] };
  }

  return message;
}

export async function checkTikTokFeed(client, options = {}) {
  const { force = false } = options;

  if (isChecking) return { ok: false, message: "TikTok check already running." };

  if (!ids.tiktokChannel) {
    const message = "TikTok channel is not configured. Set TIKTOK_CHANNEL_ID in .env.";
    console.warn(message);
    return { ok: false, message };
  }

  isChecking = true;

  try {
    const { post: newestPost, checked, errors } = await getLatestTikTokFromRss();

    if (!newestPost?.id) {
      const message = errors.length
        ? `No TikTok post found. RSS errors: ${errors.join(" | ")}`
        : "No TikTok post found in the configured RSS feeds.";
      logTikTok(message);
      return { ok: false, message, checked, errors };
    }

    if (!force && lastPostId === newestPost.id) {
      const message = `No new TikTok. Latest is already saved: ${newestPost.id}`;
      logTikTok(message);
      return { ok: true, duplicate: true, message, post: newestPost, checked, errors };
    }

    const channel = await client.channels.fetch(ids.tiktokChannel);
    if (!channel?.isTextBased()) {
      const message = `TikTok channel ${ids.tiktokChannel} was not found or is not text-based.`;
      console.warn(message);
      return { ok: false, message, post: newestPost, checked, errors };
    }

    if (!lastPostId && tiktok.skipInitialPost && !force) {
      lastPostId = newestPost.id;
      saveLastTikTokPost(newestPost);
      const message = `Saved initial TikTok post without announcing: ${newestPost.id}`;
      logTikTok(message);
      return { ok: true, skippedInitial: true, message, post: newestPost, checked, errors };
    }

    await channel.send(buildTikTokMessage(newestPost));
    lastPostId = newestPost.id;
    saveLastTikTokPost(newestPost);

    const message = `${force ? "Force-posted" : "Announced"} TikTok post: ${newestPost.id}`;
    logTikTok(message);
    return { ok: true, announced: true, message, post: newestPost, checked, errors };
  } catch (error) {
    console.error("TikTok RSS bot error:", error.stack || error.message);
    return { ok: false, message: error.message };
  } finally {
    isChecking = false;
  }
}

export async function handleTikTokCheckCommand(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: "You need Manage Server permission to use this.", ephemeral: true });
  }

  const force = interaction.options.getBoolean("force") || false;
  await interaction.deferReply({ ephemeral: true });

  const result = await checkTikTokFeed(interaction.client, { force });
  const latest = result.post ? `\nLatest: ${result.post.link}` : "";
  const checked = result.checked?.length ? `\nChecked: ${result.checked.join(" | ")}` : "";
  const errors = result.errors?.length ? `\nErrors: ${result.errors.join(" | ")}` : "";

  return interaction.editReply(`${result.ok ? "✅" : "⚠️"} ${result.message}${latest}${checked}${errors}`.slice(0, 1900));
}
