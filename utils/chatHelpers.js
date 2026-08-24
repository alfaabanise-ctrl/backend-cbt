import Conversation from '../models/Chat.js'
import User from "../models/User.js";


export const saveMessageToConversation = async (receiverid, sender, content) => {
  try {
    const receiverData = await User.findById(receiverid);
    const senderData = await User.findById(sender);

    const participants = [sender.toString(), receiverid.toString()].sort();
    let conversation = await Conversation.findOne({ participants });

    if (!conversation) {
      conversation = new Conversation({ participants, messages: [] });
    }

    const newIndex = conversation.messages.length + 1;

    const newMessage = {
      sender,
      content,
      index: newIndex,
      timestamp: new Date(),
      viewed: false,
    };

    conversation.messages.push(newMessage);

    await conversation.save();

    // ✅ Return only the newly added message (last one in array)
    return conversation.messages[conversation.messages.length - 1];

  } catch (err) {
    return {
      success: false,
      error: err.message || 'Failed to send message'
    };
  }
};