const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const { token, channelId } = require("./config.json");
const fs = require("fs");
const { status } = require("minecraft-server-util");
const axios = require("axios");

const embedLogPath = "./embed.json";
const serverConfig = require("./server.json");

async function getBedrockStatus(ip, port) {
    try {
        return {
            online: true,
            players: "N/A",
            version: "N/A"
        };
    } catch (error) {
        console.error(`Error fetching data from Bedrock server ${ip}:${port}:`, error.message);
        return { online: false, players: "N/A", version: "Unknown" };
    }
}

async function getJavaServerStatus(ip, port) {
    try {
        const response = await status(ip, port);
        return {
            online: true,
            players: `${response.players.online}/${response.players.max}`,
            version: response.version.name || "Unknown",
        };
    } catch (error) {
        console.error(`Error fetching data from Java server ${ip}:${port}:`, error.message);
        return { online: false, players: "N/A", version: "Unknown" };
    }
}

async function getServerStatus(ip, port, type) {
    if (type === "Java") {
        return getJavaServerStatus(ip, port);
    } else if (type === "Bedrock") {
        return getBedrockStatus(ip, port);
    } else {
        return { online: false, players: "N/A", version: "Unknown" };
    }
}

function formatTime(date) {
    const now = new Date(date);
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const formattedTime = `${hours}:${minutes < 10 ? '0' + minutes : minutes}`;

    const today = new Date();
    if (now.toDateString() === today.toDateString()) {
        return `Today at ${formattedTime}`;
    }

    const day = now.getDate();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    return `${month}/${day}/${year}, ${formattedTime}`;
}

async function updateEmbed() {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
        console.error("Invalid channel ID in config.json");
        return;
    }

    const embedData = fs.existsSync(embedLogPath)
        ? JSON.parse(fs.readFileSync(embedLogPath, "utf-8"))
        : { embedId: null };
    let embedId = embedData.embedId;
    let embedMessage;

    const mainServerStatuses = await Promise.all(
        serverConfig.servers.map(server => getServerStatus(server.ip, server.port, server.type))
    );

    const currentTime = formatTime(new Date());

    const embed = new EmbedBuilder()
        .setTitle("Minecraft Server Status")
        .setColor("#ffffff")
        .setTimestamp()
        .setFooter({ text: `Last updated at: ${currentTime}`, iconURL: client.user.avatarURL() })
        .setThumbnail(client.user.avatarURL());

    embed.addFields({
        name: "Server Status",
        value: mainServerStatuses.map((status, index) => {
            const server = serverConfig.servers[index];
            return `${server.name}:\n` + 
                   `IP: \`${server.ip}:${server.port}\`\n` + 
                   `${status.online ? "<a:Online:1333088499116675154> Online" : "<a:Offline:1333088552958955551> Offline"}`;
        }).join("\n\n"),
        inline: false
    });

    try {
        if (embedId) {
            embedMessage = await channel.messages.fetch(embedId);
            await embedMessage.edit({ embeds: [embed] });
        } else {
            embedMessage = await channel.send({ embeds: [embed] });
            embedData.embedId = embedMessage.id;
            fs.writeFileSync(embedLogPath, JSON.stringify(embedData, null, 2));
        }
    } catch (error) {
        console.error("Error handling embed:", error.message);
        if (embedId) {
            embedData.embedId = null;
            fs.writeFileSync(embedLogPath, JSON.stringify(embedData, null, 2));
        }
        embedMessage = await channel.send({ embeds: [embed] });
        embedData.embedId = embedMessage.id;
        fs.writeFileSync(embedLogPath, JSON.stringify(embedData, null, 2));
    }
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", () => {
    console.log(`Logged in as ${client.user.tag}`);
    updateEmbed();
    setInterval(updateEmbed, 60000);

    client.application.commands.create(
        new SlashCommandBuilder().setName("ping").setDescription("Check the bot's ping."),
    );
});

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === "ping") {
        const ping = client.ws.ping;
        await interaction.reply(`Pong! Latency is ${ping}ms.`);
    }
});

client.on("error", (error) => {
    console.error("Client encountered an error:", error.message);
});

client.login(token);
