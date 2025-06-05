import { ButtonInteraction, CacheType } from 'discord.js';

import { ButtonHandler } from './buttonHandler.js';
import { Logger } from '../services/index.js';

export class TurnSubmitHelpButtonHandler implements ButtonHandler {
    customIdPrefix = 'turn_submit_help_';

    public async execute(interaction: ButtonInteraction<CacheType>): Promise<void> {
        const turnId = interaction.customId.substring(this.customIdPrefix.length);
        const discordUserId = interaction.user.id;

        Logger.info(`TurnSubmitHelpButtonHandler: User ${interaction.user.username} (${discordUserId}) requesting help for turn ${turnId}`);

        const helpMessage = `📋 **How to Submit with File Upload:**

**Step 1:** Type \`/submit-turn\` in this channel
**Step 2:** When the command appears, click on the **image** field
**Step 3:** Choose "Upload a file" and select your image
**Step 4:** Press Enter to submit

**Supported formats:** PNG, JPG, JPEG, GIF, WEBP
**Max file size:** 25MB (Discord limit)

**Benefits of file upload:**
✅ More reliable than URLs
✅ No need to host images elsewhere  
✅ Better image quality preservation
✅ Faster submission process

**Need the turn ID?** It's \`${turnId}\` (the command will auto-detect it if you have only one pending turn)

💡 **Tip:** You can also drag and drop your image file directly onto the attachment field!`;

        await interaction.reply({
            content: helpMessage,
            ephemeral: true
        });

        Logger.info(`TurnSubmitHelpButtonHandler: Provided help information for turn ${turnId} to user ${discordUserId}`);
    }
} 