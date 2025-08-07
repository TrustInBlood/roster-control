const { SlashCommandBuilder } = require('discord.js');
const { withLoadingMessage, createResponseEmbed, sendSuccess } = require('../utils/messageHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with bot latency'),
    async execute(interaction) {
        await withLoadingMessage(interaction, 'Pinging...', async () => {
            const latency = Date.now() - interaction.createdTimestamp;
            const apiLatency = Math.round(interaction.client.ws.ping);
            
            const embed = createResponseEmbed({
                title: 'Pong! 🏓',
                description: 'Bot latency information',
                fields: [
                    { name: 'Bot Latency', value: `${latency}ms`, inline: true },
                    { name: 'API Latency', value: `${apiLatency}ms`, inline: true }
                ]
            });
            
            await sendSuccess(interaction, 'Latency check complete!', embed);
        });
    },
};
