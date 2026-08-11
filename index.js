import "dotenv/config";
import { ActivityType, Client, GatewayIntentBits, Partials } from "discord.js";
import { TOKEN, intervals } from "./config.js";
import { registerCommands } from "./registerCommands.js";
import { registerInteractionHandler } from "./interactions.js";
import { registerWelcome } from "./welcome.js";
import { registerQueueEvents, updateQueueList } from "./queue.js";
import { registerServerLogs } from "./serverLogs.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.User]
});

registerWelcome(client);
registerQueueEvents(client);
registerInteractionHandler(client);
registerServerLogs(client);

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  await registerCommands(client).catch(error => console.error("Failed to register slash commands:", error.message));

  client.user.setPresence({
    status: "online",
    activities: [{ name: "JGraphix Studio", type: ActivityType.Watching }]
  });

  await updateQueueList(client);
  setInterval(() => updateQueueList(client), intervals.queueUpdateMs);
});

if (!TOKEN) {
  console.error("Missing Discord token. Set DISCORD_TOKEN or TOKEN in your environment variables.");
  process.exit(1);
}

client.login(TOKEN);
