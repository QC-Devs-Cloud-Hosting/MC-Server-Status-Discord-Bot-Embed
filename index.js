const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const { token, channelId } = require("./config.json");
const fs = require("fs");
const axios = require("axios");

const embedLogPath = "./embed.json";
const serverConfig = require("./server.json");

async function getServerStatus(ip, port) {
    const url = `https://api.mcsrvstat.us/2/${ip}:${port}`;
    try {
        const response = await axios.get(url);
        const jsonData = response.data;
        return {
            online: jsonData.online || false,
            players: jsonData.players
                ? `${jsonData.players.online}/${jsonData.players.max}`
                : "N/A",
            version: jsonData.version || "Unknown",
        };
    } catch (error) {
        console.error(`Error fetching or parsing data from ${url}:`, error.message);
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

    const embedData = JSON.parse(fs.readFileSync(embedLogPath, "utf-8"));
    let embedId = embedData.embedId;
    let embedMessage;

    const mainServerStatuses = await Promise.all(
        serverConfig.main_servers.map(server => getServerStatus(server.ip, server.port))
    );

    const additionalServerStatuses = await Promise.all(
        serverConfig.additional_information.map(server => getServerStatus(server.ip, server.port))
    );

    const embed = new EmbedBuilder()
        .setTitle("Minecraft Server Status")
        .setColor("#8b00ff")
        .setTimestamp()
        .setFooter({ text: `Last updated at: ${formatTime(new Date())}` });

    embed.addFields({
        name: "Main Servers",
        value: mainServerStatuses.map((status, index) => {
            const server = serverConfig.main_servers[index];
            return `${server.name}: ${status.online ? `🟢 Online\nPlayers: ${status.players}\nVersion: ${status.version}` : "🔴 Offline"}`;
        }).join("\n\n"),
        inline: false
    });

    embed.addFields({
        name: "Additional Information",
        value: `
        **Proxy:**
        ${additionalServerStatuses[0].online ? "🟢 Online" : "🔴 Offline"}

        **Backup:**
        ${additionalServerStatuses[1].online ? "🟢 Online" : "🔴 Offline"}
        `,
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
});

client.on("error", (error) => {
    console.error("Client encountered an error:", error.message);
});

client.login(token);
