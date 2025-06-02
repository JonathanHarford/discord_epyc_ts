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

    /**
     * Formats a timeout duration in minutes to a compact format.
     * Uses short units like "1m", "53s", "1d5h3m2s" for more concise display.
     * 
     * @param minutes - The timeout duration in minutes
     * @returns A compact formatted string like "30m", "2h", "1d5h3m"
     */
    public static formatTimeoutCompact(minutes: number): string {
        const totalSeconds = minutes * 60;
        
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;
        
        let result = '';
        if (days > 0) result += `${days}d`;
        if (hours > 0) result += `${hours}h`;
        if (mins > 0) result += `${mins}m`;
        if (secs > 0) result += `${secs}s`;
        
        // If everything is 0, return "0s"
        if (result === '') result = '0s';
        
        return result;
    }

    /**
     * Formats remaining time from a future date to a precise format.
     * Shows format like "3m44s", "1h23m", "2d5h" for timeout warnings.
     * 
     * @param futureDate - The target date/time
     * @returns A precise formatted string like "3m44s", "1h23m", or "expired" if past
     */
    public static formatRemainingTime(futureDate: Date): string {
        const now = new Date();
        const diffMs = futureDate.getTime() - now.getTime();
        
        if (diffMs <= 0) {
            return 'expired';
        }
        
        const totalSeconds = Math.floor(diffMs / 1000);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        // Show most significant units only (max 2 units for readability)
        if (days > 0) {
            return hours > 0 ? `${days}d${hours}h` : `${days}d`;
        } else if (hours > 0) {
            return minutes > 0 ? `${hours}h${minutes}m` : `${hours}h`;
        } else if (minutes > 0) {
            return seconds > 0 ? `${minutes}m${seconds}s` : `${minutes}m`;
        } else {
            return `${seconds}s`;
        }
    }
}
