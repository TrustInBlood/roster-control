const { EmbedBuilder } = require('discord.js');
const { CHANNELS } = require('../../config/channels');
const { ON_DUTY_ROLE_ID } = require('../../config/roles');
// const DutyStatusFactory = require('../services/DutyStatusFactory'); // Available for future automatic duty management

/**
 * Handles voice state updates and notifies on-duty admins when users join the monitored channel
 * @param {VoiceState} oldState - The old voice state
 * @param {VoiceState} newState - The new voice state
 */
async function handleVoiceStateUpdate(oldState, newState) {
    try {
        // Check if this is a join event to our monitored channel
        if (newState.channelId === CHANNELS.MONITORED_VOICE && oldState.channelId !== CHANNELS.MONITORED_VOICE) {
            const channel = newState.guild.channels.cache.get(CHANNELS.DUTY_LOGS);
            if (!channel) return;

            const member = newState.member;
            const voiceChannel = newState.channel;
            
            const embed = new EmbedBuilder()
                .setColor(0x00FFFF) // Cyan color for voice notifications
                .setTitle('Voice Channel Join')
                .setDescription(`${member} joined ${voiceChannel.toString()}`)
                .addFields(
                    { name: 'Username', value: member.user.tag, inline: true },
                    { name: 'Nickname', value: member.nickname || 'None', inline: true }
                )
                .setTimestamp();

            // If the user has an avatar, add it to the embed
            if (member.user.avatar) {
                embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
            }

            await channel.send({
                content: `<@&${ON_DUTY_ROLE_ID}> User joined monitored channel`,
                embeds: [embed]
            });
        }

        // Future enhancement: Automatic duty management based on voice state
        // This is where the DutyStatusFactory could be used for automatic role removal
        // when admins are inactive for extended periods or join/leave specific channels
        //
        // Example implementation:
        // if (shouldAutoRemoveDuty(oldState, newState)) {
        //     const dutyFactory = new DutyStatusFactory();
        //     await dutyFactory.removeInactiveDuty(member, {
        //         source: 'voice_state',
        //         reason: 'User left monitored channel or became inactive',
        //         skipNotification: false
        //     });
        // }
    } catch (error) {
        console.error('Error handling voice state update:', error);
    }
}

module.exports = {
    handleVoiceStateUpdate
};