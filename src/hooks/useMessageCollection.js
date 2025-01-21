import { useState } from 'react';

/**
 * A custom hook for managing the conversation between the user and the AI.
 *
 * @returns {Object} An object containing the `messages` array and the `addMessage` function.
 */
const useMessageCollection = () => {
  const initialMsg = {
    id: 1,
    createdAt: Date.now(),
    text: "Hello! I'm your AI Recipe Assistant. I can help you understand recipes from YouTube videos and clarify your doubts. Just provide a video link to get started!",
    ai: true,
  };
  const [messages, setMessages] = useState([initialMsg]);

  /**
   * A function for adding a new message to the collection.
   *
   * @param {Object} message - The message to add to the collection.
   */
  const addMessage = (message) => {
    setMessages((prev) => [...prev, message]);
  };

  const clearMessages = () => setMessages([initialMsg]);

  return [messages, addMessage, clearMessages];
};

export default useMessageCollection;
