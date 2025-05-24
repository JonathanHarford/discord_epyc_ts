import { Locale, PermissionsString } from 'discord.js';

import { strings } from '../../lang/strings.js';

interface PermissionData {
    displayName(langCode?: Locale): string;
}

export class Permission {
    public static Data: {
        [key in PermissionsString]: PermissionData;
    } = {
        AddReactions: {
            displayName(): string {
                return strings.permissions.AddReactions;
            },
        },
        Administrator: {
            displayName(): string {
                return strings.permissions.Administrator;
            },
        },
        AttachFiles: {
            displayName(): string {
                return strings.permissions.AttachFiles;
            },
        },
        BanMembers: {
            displayName(): string {
                return strings.permissions.BanMembers;
            },
        },
        ChangeNickname: {
            displayName(): string {
                return strings.permissions.ChangeNickname;
            },
        },
        Connect: {
            displayName(): string {
                return strings.permissions.Connect;
            },
        },
        CreateEvents: {
            displayName(): string {
                return strings.permissions.CreateEvents;
            },
        },
        CreateGuildExpressions: {
            displayName(): string {
                return strings.permissions.CreateGuildExpressions;
            },
        },
        CreateInstantInvite: {
            displayName(): string {
                return strings.permissions.CreateInstantInvite;
            },
        },
        CreatePrivateThreads: {
            displayName(): string {
                return strings.permissions.CreatePrivateThreads;
            },
        },
        CreatePublicThreads: {
            displayName(): string {
                return strings.permissions.CreatePublicThreads;
            },
        },
        DeafenMembers: {
            displayName(): string {
                return strings.permissions.DeafenMembers;
            },
        },
        EmbedLinks: {
            displayName(): string {
                return strings.permissions.EmbedLinks;
            },
        },
        KickMembers: {
            displayName(): string {
                return strings.permissions.KickMembers;
            },
        },
        ManageChannels: {
            displayName(): string {
                return strings.permissions.ManageChannels;
            },
        },
        ManageEmojisAndStickers: {
            displayName(): string {
                return strings.permissions.ManageEmojisAndStickers;
            },
        },
        ManageEvents: {
            displayName(): string {
                return strings.permissions.ManageEvents;
            },
        },
        ManageGuild: {
            displayName(): string {
                return strings.permissions.ManageGuild;
            },
        },
        ManageGuildExpressions: {
            displayName(): string {
                return strings.permissions.ManageGuildExpressions;
            },
        },
        ManageMessages: {
            displayName(): string {
                return strings.permissions.ManageMessages;
            },
        },
        ManageNicknames: {
            displayName(): string {
                return strings.permissions.ManageNicknames;
            },
        },
        ManageRoles: {
            displayName(): string {
                return strings.permissions.ManageRoles;
            },
        },
        ManageThreads: {
            displayName(): string {
                return strings.permissions.ManageThreads;
            },
        },
        ManageWebhooks: {
            displayName(): string {
                return strings.permissions.ManageWebhooks;
            },
        },
        MentionEveryone: {
            displayName(): string {
                return strings.permissions.MentionEveryone;
            },
        },
        ModerateMembers: {
            displayName(): string {
                return strings.permissions.ModerateMembers;
            },
        },
        MoveMembers: {
            displayName(): string {
                return strings.permissions.MoveMembers;
            },
        },
        MuteMembers: {
            displayName(): string {
                return strings.permissions.MuteMembers;
            },
        },
        PrioritySpeaker: {
            displayName(): string {
                return strings.permissions.PrioritySpeaker;
            },
        },
        ReadMessageHistory: {
            displayName(): string {
                return strings.permissions.ReadMessageHistory;
            },
        },
        RequestToSpeak: {
            displayName(): string {
                return strings.permissions.RequestToSpeak;
            },
        },
        SendMessages: {
            displayName(): string {
                return strings.permissions.SendMessages;
            },
        },
        SendMessagesInThreads: {
            displayName(): string {
                return strings.permissions.SendMessagesInThreads;
            },
        },
        SendPolls: {
            displayName(): string {
                return strings.permissions.SendPolls;
            },
        },
        SendTTSMessages: {
            displayName(): string {
                return strings.permissions.SendTTSMessages;
            },
        },
        SendVoiceMessages: {
            displayName(): string {
                return strings.permissions.SendVoiceMessages;
            },
        },
        Speak: {
            displayName(): string {
                return strings.permissions.Speak;
            },
        },
        Stream: {
            displayName(): string {
                return strings.permissions.Stream;
            },
        },
        UseApplicationCommands: {
            displayName(): string {
                return strings.permissions.UseApplicationCommands;
            },
        },
        UseEmbeddedActivities: {
            displayName(): string {
                return strings.permissions.UseEmbeddedActivities;
            },
        },
        UseExternalApps: {
            displayName(): string {
                return strings.permissions.UseExternalApps;
            },
        },
        UseExternalEmojis: {
            displayName(): string {
                return strings.permissions.UseExternalEmojis;
            },
        },
        UseExternalSounds: {
            displayName(): string {
                return strings.permissions.UseExternalSounds;
            },
        },
        UseExternalStickers: {
            displayName(): string {
                return strings.permissions.UseExternalStickers;
            },
        },
        UseSoundboard: {
            displayName(): string {
                return strings.permissions.UseSoundboard;
            },
        },
        UseVAD: {
            displayName(): string {
                return strings.permissions.UseVAD;
            },
        },
        ViewAuditLog: {
            displayName(): string {
                return strings.permissions.ViewAuditLog;
            },
        },
        ViewChannel: {
            displayName(): string {
                return strings.permissions.ViewChannel;
            },
        },
        ViewCreatorMonetizationAnalytics: {
            displayName(): string {
                return strings.permissions.ViewCreatorMonetizationAnalytics;
            },
        },
        ViewGuildInsights: {
            displayName(): string {
                return strings.permissions.ViewGuildInsights;
            },
        },
    };
}
