import React, { createContext, useState, useEffect } from 'react';

const ChatContext = createContext({});

const STORAGE_KEY = 'recipe-chat-history';
const MAX_STORAGE_SIZE = 4 * 1024 * 1024; // 4MB limit for safety

const ChatContextProvider = (props) => {
  const [messages, setMessages] = useState([]);

  // Load messages from localStorage on initialization
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsedMessages = JSON.parse(stored);
        if (Array.isArray(parsedMessages) && parsedMessages.length > 0) {
          // Clean up any incomplete streaming messages and loading messages
          const cleanedMessages = parsedMessages
            .map((msg) => {
              // Remove any loading messages that might have been saved
              if (msg.isLoading) {
                return null;
              }
              // If it's an AI message that was streaming (incomplete), mark it as complete and clean the text
              if (msg.ai && msg.complete === false && msg.text) {
                // Apply the same text cleaning that would happen on completion
                const cleanedText = msg.text
                  .replace(/\n{3,}/g, '\n\n') // Replace 3+ consecutive line breaks with just 2
                  .split('\n')
                  .map((line) => line.trim())
                  .filter((line) => line.length > 0)
                  .join('\n');

                return {
                  ...msg,
                  text: cleanedText,
                  complete: true,
                  wasIncompleteOnReload: true, // Flag to indicate this was recovered from incomplete state
                };
              }
              return msg;
            })
            .filter(Boolean); // Remove null entries (loading messages)

          setMessages(cleanedMessages);
        }
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Save messages to localStorage whenever messages change
  useEffect(() => {
    // Don't save empty arrays or arrays with only welcome messages
    if (
      messages.length === 0 ||
      (messages.length === 1 && messages[0].text?.includes('Welcome to ChatRecipe'))
    ) {
      return;
    }

    try {
      const messagesJson = JSON.stringify(messages);

      // Check storage size limit
      if (messagesJson.length > MAX_STORAGE_SIZE) {
        // Keep only recent messages if storage is too large
        const recentMessages = messages.slice(-50);
        const recentJson = JSON.stringify(recentMessages);
        localStorage.setItem(STORAGE_KEY, recentJson);
      } else {
        localStorage.setItem(STORAGE_KEY, messagesJson);
      }
    } catch (error) {
      console.error('Error saving chat history:', error);
      // If storage is full, try to save only recent messages
      try {
        const recentMessages = messages.slice(-20);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(recentMessages));
      } catch (fallbackError) {
        console.error('Failed to save even recent messages:', fallbackError);
      }
    }
  }, [messages]);

  const addMessage = (messageOrCallback) => {
    setMessages((prevMessages) => {
      // If it's a callback, call the callback with previous messages
      if (typeof messageOrCallback === 'function') {
        return messageOrCallback(prevMessages);
      }

      // If it's a direct message, check if it's a duplicate
      const isDuplicate = prevMessages.some(
        (msg) => msg.text === messageOrCallback.text && msg.ai === messageOrCallback.ai,
      );

      // Only add the message if it's not a duplicate
      return isDuplicate ? prevMessages : [...prevMessages, messageOrCallback];
    });
  };

  const clearMessages = () => {
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing localStorage:', error);
    }

    // Add a fresh welcome message after clearing
    setTimeout(() => {
      const welcomeMessage = {
        id: `msg_welcome_${Date.now()}`,
        createdAt: Date.now(),
        text: "👋 Welcome to ChatRecipe! Share a YouTube cooking video link, and I'll break down the recipe for you.",
        ai: true,
      };
      setMessages([welcomeMessage]);
    }, 100);
  };

  return (
    <ChatContext.Provider value={[messages, addMessage, clearMessages]}>
      {props.children}
    </ChatContext.Provider>
  );
};

export { ChatContext, ChatContextProvider };
