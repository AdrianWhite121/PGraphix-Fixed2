import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";
import { TOKEN } from "./config.js";
import { registerCommands } from "./registerCommands.js";

if (!TOKEN) {
  console.error("Missing Discord token. Set DISCORD_TOKEN or TOKEN in your environment variables.");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  try {
    console.log(`Deploying commands as ${client.user.tag}...`);
    await registerCommands(client);
    console.log("Command deploy complete.");
  } catch (error) {
    console.error("Command deploy failed:", error);
    process.exitCode = 1;
  } finally {
    client.destroy();
  }
});

client.login(TOKEN);
