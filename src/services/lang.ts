import { EmbedBuilder, Locale, LocalizationMap, resolveColor } from 'discord.js';

import { Language } from '../models/enum-helpers/index.js';
import { enStrings, getNestedValue, replaceVariables } from '../lang/en.js';

export class Lang {
    public static getEmbed(
        location: string,
        langCode: Locale,
        variables?: { [name: string]: string }
    ): EmbedBuilder {
        // Get the embed data from our English strings
        const embedData = getNestedValue(enStrings, location);
        
        if (!embedData) {
            console.warn(`[Lang] Embed not found for location: ${location}`);
            return new EmbedBuilder({
                description: `Missing embed: ${location}`,
                color: resolveColor(enStrings.colors.error)
            });
        }

        // Process the embed data and replace variables
        const processedData = this.processEmbedData(embedData, variables);
        
        return new EmbedBuilder({
            author: processedData.author,
            title: processedData.title,
            url: processedData.url,
            thumbnail: processedData.thumbnail ? {
                url: processedData.thumbnail,
            } : undefined,
            description: processedData.description,
            fields: processedData.fields?.map(field => ({
                name: field.name,
                value: field.value,
                inline: field.inline ? field.inline : false,
            })),
            image: processedData.image ? {
                url: processedData.image,
            } : undefined,
            footer: processedData.footer ? {
                text: processedData.footer.text,
                iconURL: processedData.footer.icon,
            } : undefined,
            timestamp: processedData.timestamp ? Date.now() : undefined,
            color: resolveColor(processedData.color ?? enStrings.colors.default),
        });
    }

    public static getRegex(location: string, langCode: Locale): RegExp {
        const regexString = getNestedValue(enStrings, location);
        
        if (!regexString) {
            console.warn(`[Lang] Regex not found for location: ${location}`);
            return new RegExp('.*'); // Default regex that matches anything
        }

        try {
            // Parse regex string like "/pattern/flags"
            const match = regexString.match(/^\/(.+)\/([gimuy]*)$/);
            if (match) {
                return new RegExp(match[1], match[2]);
            } else {
                // If not in regex format, treat as literal string
                return new RegExp(regexString);
            }
        } catch (error) {
            console.warn(`[Lang] Invalid regex for location ${location}: ${regexString}`);
            return new RegExp('.*');
        }
    }

    public static getRef(
        location: string,
        langCode: Locale,
        variables?: { [name: string]: string }
    ): string {
        const value = getNestedValue(enStrings, location);
        
        if (value === undefined || value === null) {
            console.warn(`[Lang] Reference not found for location: ${location}`);
            return location; // Return the key itself as fallback
        }

        // Handle arrays by joining with newlines
        if (Array.isArray(value)) {
            const joinedValue = value.join('\n');
            return variables ? replaceVariables(joinedValue, variables) : joinedValue;
        }

        // Handle strings
        if (typeof value === 'string') {
            return variables ? replaceVariables(value, variables) : value;
        }

        // For other types, convert to string
        const stringValue = String(value);
        return variables ? replaceVariables(stringValue, variables) : stringValue;
    }

    public static getRefLocalizationMap(
        location: string,
        variables?: { [name: string]: string }
    ): LocalizationMap {
        // Since we only support English now, just return English for all locales
        const englishValue = this.getRef(location, Language.Default, variables);
        
        let obj: LocalizationMap = {};
        for (let langCode of Language.Enabled) {
            obj[langCode] = englishValue;
        }
        return obj;
    }

    public static getCom(location: string, variables?: { [name: string]: string }): string {
        // COM references are just regular references in our simplified system
        return this.getRef(location, Language.Default, variables);
    }

    private static processEmbedData(embedData: any, variables?: { [name: string]: string }): any {
        if (!embedData) return embedData;

        const processed = { ...embedData };

        // Process title
        if (processed.title) {
            processed.title = variables ? replaceVariables(processed.title, variables) : processed.title;
        }

        // Process description
        if (processed.description) {
            if (Array.isArray(processed.description)) {
                processed.description = processed.description.join('\n');
            }
            processed.description = variables ? replaceVariables(processed.description, variables) : processed.description;
        }

        // Process fields
        if (processed.fields && Array.isArray(processed.fields)) {
            processed.fields = processed.fields.map((field: any) => {
                const processedField = { ...field };
                
                if (processedField.name) {
                    processedField.name = variables ? replaceVariables(processedField.name, variables) : processedField.name;
                }
                
                if (processedField.value) {
                    if (Array.isArray(processedField.value)) {
                        processedField.value = processedField.value.join('\n');
                    }
                    processedField.value = variables ? replaceVariables(processedField.value, variables) : processedField.value;
                }
                
                return processedField;
            });
        }

        // Process footer
        if (processed.footer && processed.footer.text) {
            processed.footer.text = variables ? replaceVariables(processed.footer.text, variables) : processed.footer.text;
        }

        return processed;
    }
}
