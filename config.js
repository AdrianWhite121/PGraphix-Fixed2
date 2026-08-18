import path from "path";

export const TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN;

export const ids = {
  guild: process.env.GUILD_ID || "",
  welcomeChannel: process.env.WELCOME_CHANNEL_ID || "1511530891728392272",
  queueChannel: process.env.QUEUE_CHANNEL_ID || "",
  modLogChannel: process.env.MODLOG_CHANNEL_ID || "",
  serverLogChannel: process.env.SERVER_LOG_CHANNEL_ID || "1473204678543278170",
  staffRole: process.env.STAFF_ROLE_ID || "1418062158704414801",
  autoRole: process.env.AUTO_ROLE_ID || "1473103699722375168",
  wipPingRole: process.env.WIP_PING_ROLE_ID || "1473457354082357379",
  reactionRoleChannel: process.env.REACTION_ROLE_CHANNEL_ID || "1473457327012315206",
  ticketTranscriptChannel: process.env.TICKET_TRANSCRIPT_CHANNEL_ID || "1473208365466390568"
};

export const intervals = {
  queueUpdateMs: Number(process.env.QUEUE_UPDATE_INTERVAL_MS || 60000)
};

export const paths = {
  dataDir: process.env.DATA_DIR || path.join(process.cwd(), "data"),
  logo: "./logo.png"
};


export const ticketTypes = {
  livery: {
    label: "Livery Ticket",
    queueLabel: "Livery",
    emoji: "🎨",
    categoryId: "1473204211998130388",
    accessRoleIds: ["1473175391157096559", "1473175549445804095"]
  },
  eup: {
    label: "EUP Ticket",
    queueLabel: "EUP",
    emoji: "👕",
    categoryId: "1477518405178491012",
    accessRoleIds: ["1507220470758375424", "1473175549445804095"]
  },
  siren: {
    label: "Siren Ticket",
    queueLabel: "Sirens",
    emoji: "🚨",
    categoryId: "1483585408205066280",
    accessRoleIds: ["1473175549445804095"]
  },
  media: {
    label: "Media Ticket",
    queueLabel: "Media",
    emoji: "📸",
    categoryId: "1483585369600426024",
    accessRoleIds: ["1481169207113551972", "1473175549445804095"]
  },
  support: {
    label: "Support Ticket",
    queueLabel: "Support",
    emoji: "❓",
    categoryId: "1493798324040372264",
    accessRoleIds: ["1473175549445804095"]
  },
  vehicle: {
    label: "Vehicle Development Ticket",
    queueLabel: "Vehicle Development",
    emoji: "🚗",
    categoryId: "1539011174379819088",
    accessRoleIds: ["1508682828215357520", "1473175549445804095"]
  }
};
