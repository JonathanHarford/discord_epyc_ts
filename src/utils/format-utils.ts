import { ApplicationCommand, Guild, Locale } from 'discord.js';
import { filesize } from 'filesize';
import { Duration } from 'luxon';

export class FormatUtils {
    public static roleMention(guild: Guild, discordId: string): string {
        if (discordId === '@here') {
            return discordId;
        }

        if (discordId === guild.id) {
            return '@everyone';
        }

        return `<@&${discordId}>`;
    }

    public static channelMention(discordId: string): string {
        return `<#${discordId}>`;
    }

    public static userMention(discordId: string): string {
        return `<@!${discordId}>`;
    }

            // Format command for display
    // https://github.com/discordjs/discord.js/pull/8818
    public static commandMention(command: ApplicationCommand, subParts: string[] = []): string {
        let name = [command.name, ...subParts].join(' ');
        return `</${name}:${command.id}>`;
    }

    public static duration(milliseconds: number, langCode: Locale): string {
        return Duration.fromObject(
            Object.fromEntries(
                Object.entries(
                    Duration.fromMillis(milliseconds, { locale: langCode })
                        .shiftTo(
                            'year',
                            'quarter',
                            'month',
                            'week',
                            'day',
                            'hour',
                            'minute',
                            'second'
                        )
                        .toObject()
                ).filter(([_, value]) => !!value) // Remove units that are 0
            )
        ).toHuman({ maximumFractionDigits: 0 });
    }

    public static fileSize(bytes: number): string {
        return filesize(bytes, { output: 'string', pad: true, round: 2 });
    }

    /**
     * Formats a timeout duration in minutes to a human-readable format.
     * Automatically chooses the most appropriate unit (minutes, hours, or days).
     * 
     * @param minutes - The timeout duration in minutes
     * @returns A formatted string like "30 minutes", "2 hours", or "3 days"
     */
    public static formatTimeout(minutes: number): string {
        if (minutes < 60) {
            return minutes === 1 ? '1 minute' : `${minutes} minutes`;
        } else if (minutes < 1440) { // Less than 24 hours
            const hours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;
            
            if (remainingMinutes === 0) {
                return hours === 1 ? '1 hour' : `${hours} hours`;
            } else {
                const hourText = hours === 1 ? '1 hour' : `${hours} hours`;
                const minuteText = remainingMinutes === 1 ? '1 minute' : `${remainingMinutes} minutes`;
                return `${hourText} and ${minuteText}`;
            }
        } else {
            const days = Math.floor(minutes / 1440);
            const remainingHours = Math.floor((minutes % 1440) / 60);
            
            if (remainingHours === 0) {
                return days === 1 ? '1 day' : `${days} days`;
            } else {
                const dayText = days === 1 ? '1 day' : `${days} days`;
                const hourText = remainingHours === 1 ? '1 hour' : `${remainingHours} hours`;
                return `${dayText} and ${hourText}`;
            }
        }
    }
}
