# JG/PG Studios Discord Bot — Modular Version

This version keeps every required deployment file in one project folder so GitHub uploads cannot skip nested folders:

```txt
index.js
config.js
registerCommands.js
interactions.js
welcome.js
tickets.js
queue.js
reactionRoles.js
embedCreator.js
staff.js
serverLogs.js
jsonStore.js
permissions.js
```

## Included features

- Welcome messages
- Auto role on join
  - Default role: `1473103699722375168`
- Commission queue tracking
- Six ticket types:
  - Livery
  - EUP
  - Siren
  - Media
  - Vehicle
  - Support
- Ticket close button
- Embed creator command
- Staff commands:
  - `/ban`
  - `/kick`
  - `/warn`
  - `/warnings`
  - `/timeout`
  - `/untimeout`
  - `/note`
  - `/notes`
- WIP Ping reaction-role button
- Server logs for joins, leaves, kicks, bans, unbans, role changes, and timeouts
  - Default log channel: `1473204678543278170`

## Required setup

Install dependencies:

```bash
npm install
```

Create a `.env` file:

```env
DISCORD_TOKEN=your_bot_token_here
GUILD_ID=your_discord_server_id
WELCOME_CHANNEL_ID=your_welcome_channel_id
QUEUE_CHANNEL_ID=your_queue_channel_id
```

When uploading through GitHub, upload every file inside the `JGStudiosBot-main` folder. Do not upload the ZIP as a single repository file.

## Bot permissions needed

The bot needs these Discord permissions:

- View Audit Log (needed to detect who kicked/banned/changed roles)

- Manage Channels
- Manage Roles
- Send Messages
- Embed Links
- Read Message History
- Kick Members
- Ban Members
- Moderate Members

Make sure the bot role is above the auto role and WIP Ping role in the Discord role list.

## Posting menus

Run these slash commands in Discord:

- `/setup-tickets` posts the ticket dropdown menu.
- `/setup-reactionroles` posts the WIP Ping button in channel `1473457327012315206`.

## Ticket configuration

Ticket categories and ticket-access roles are in `config.js` under `ticketTypes`.

Staff commands are limited to role `1418062158704414801` by default.


## Commands not showing?

This version registers slash commands as **guild commands** so they should appear almost immediately.

1. Make sure the bot was invited with the `applications.commands` scope.
2. Run `npm install`.
3. Start the bot with `npm start`, or manually deploy commands with `npm run deploy`.
4. Watch the console for lines like `Registered 20 slash commands in guild ...`.

If the console says it registered commands but Discord still does not show them, reinvite the bot with both scopes: `bot` and `applications.commands`.
