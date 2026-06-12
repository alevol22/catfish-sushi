import 'dotenv/config';
import express from 'express';
import {
  ButtonStyleTypes,
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  MessageComponentTypes,
} from 'discord-interactions';
import {
  VerifyDiscordRequest,
  getServerLeaderboard,
  createPlayerEmbed,
} from './utils.js';
import { getFakeProfile, getWikiItem } from './game.js';

// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env.PORT || 3000;
// Parse request body and verifies incoming requests using discord-interactions package
app.use(express.json({ verify: VerifyDiscordRequest(process.env.PUBLIC_KEY) }));

/**
 * Interactions endpoint URL where Discord will send HTTP requests
 */
// TODO: Everything is handled though here VVVVVV
app.post('/interactions', async function (req, res) {
  // Interaction type and data
  const { type, data } = req.body; // might also have an ID first

  /**
   * Handle verification requests
   */
  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  // Log request bodies
  console.log(req.body);


//     if (name === 'test') {
//       // Send a message into the channel where command was triggered from
//       return res.send({
//         type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
//         data: {
//           flags: InteractionResponseFlags.IS_COMPONENTS_V2,
//           components: [
//             {
//               type: MessageComponentTypes.TEXT_DISPLAY,
//               // Fetches a random emoji to send from a helper function
//               content: `hello world ${getRandomEmoji()}`

  /**
   * Handle slash command requests
   * See https://discord.com/developers/docs/interactions/application-commands#slash-commands
   */
  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name } = data;

    // "leaderboard" command
    if (name === 'leaderboard') {
      // Send a message into the channel where command was triggered from
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: await getServerLeaderboard(req.body.guild.id),
          allowed_mentions: {
            parse: [],
          },
        },
      });
    }
    // "profile" command
    if (name === 'profile') {
      const profile = getFakeProfile(0);
      const profileEmbed = createPlayerEmbed(profile);

      // Use interaction context that the interaction was triggered from
      const interactionContext = req.body.context;

      // Construct `data` for our interaction response. The profile embed will be included regardless of interaction context
      let profilePayloadData = {
        embeds: [profileEmbed],
      };

      // If profile isn't run in a DM with the app, we'll make the response ephemeral and add a share button
      if (interactionContext !== 1) {
        // Make message ephemeral (only user who ran can see)
        profilePayloadData['flags'] = 64;
      }

      // Send response
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: profilePayloadData,
      });
    }
    // "link" command
    if (name === 'link') {
      // Send a message into the channel where command was triggered from
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content:
            'Authorize your Quests of Wumpus account with your Discord profile.',
        },
      });
    }
    // "wiki" command
    if (name === 'wiki') {
      const option = data.options[0];
      const selectedItem = getWikiItem(option.value);
      // Send a message into the channel where command was triggered from
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `${selectedItem.emoji} **${selectedItem.name}**: ${selectedItem.description}`,
        },
      });
    }
  }

  // handle button interaction
  if (type === InteractionType.MESSAGE_COMPONENT) {
    const profile = getFakeProfile(0);
    const profileEmbed = createPlayerEmbed(profile);
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [profileEmbed],
      },
    });
  }

  // console.error(`unknown command: ${name}`); HERE????
  //   return res.status(400).json({ error: 'unknown command' });
});

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});



// // To keep track of our active games
// const activeGames = {};

//   console.error('unknown interaction type', type);
//   return res.status(400).json({ error: 'unknown interaction type' });