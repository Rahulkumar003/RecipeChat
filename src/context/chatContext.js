import React, { createContext, useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';

const ChatContext = createContext({});

const BASE_STORAGE_KEY = 'recipe-chat-history';
const MAX_STORAGE_SIZE = 4 * 1024 * 1024; // 4MB limit for safety

const ChatContextProvider = (props) => {
  const [messages, setMessages] = useState([]);
  const socketRef = useRef(null);
  const location = useLocation();
  const currentSessionId = useRef(Date.now().toString()); // Unique session ID
  const lastLocationRef = useRef(location.pathname);

  // Get URL-specific storage key
  const getStorageKey = (pathname = location.pathname) => {
    if (pathname === '/') {
      return `${BASE_STORAGE_KEY}-home`;
    }
    // For video URLs, create a unique key based on the video ID
    const videoUrlMatch = pathname.match(/\/(.+)/);
    if (videoUrlMatch) {
      const encodedUrl = videoUrlMatch[1];
      try {
        const decodedUrl = decodeURIComponent(encodedUrl);
        const videoIdMatch = decodedUrl.match(/(?:v=|youtu\.be\/)([^&\?]+)/);
        if (videoIdMatch) {
          return `${BASE_STORAGE_KEY}-video-${videoIdMatch[1]}`;
        }
      } catch (e) {
        // If decoding fails, use the encoded URL
      }
      return `${BASE_STORAGE_KEY}-${encodedUrl.substring(0, 50)}`;
    }
    return `${BASE_STORAGE_KEY}-${pathname}`;
  };

  // Initialize socket connection
  useEffect(() => {
    if (!socketRef.current) {
      // Create a unique socket connection for this tab/window
      const socketOptions = {
        transports: ['websocket', 'polling'],
        forceNew: true, // Force a new connection for each tab
        timeout: 5000,
      };

      socketRef.current = io('http://192.168.1.203:5000', socketOptions);

      socketRef.current.on('connect', () => {
        console.log('Connected to backend from ChatContext with ID:', socketRef.current.id);
      });

      socketRef.current.on('connect_error', (error) => {
        console.error('Connection error from ChatContext:', error);
      });
    }

    return () => {
      if (socketRef.current) {
        console.log('Disconnecting socket from ChatContext');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  // Handle location changes (URL changes)
  useEffect(() => {
    const currentPath = location.pathname;
    const lastPath = lastLocationRef.current;

    if (currentPath !== lastPath) {
      console.log(`Location changed from ${lastPath} to ${currentPath}`);

      // Save current messages to the old location's storage
      if (messages.length > 0 && !messages[0].text?.includes('Welcome to ChatRecipe')) {
        const oldStorageKey = getStorageKey(lastPath);
        try {
          localStorage.setItem(oldStorageKey, JSON.stringify(messages));
          console.log(`Saved messages to ${oldStorageKey}`);
        } catch (error) {
          console.error('Error saving messages for old location:', error);
        }
      }

      // Load messages for the new location
      const newStorageKey = getStorageKey(currentPath);
      try {
        const stored = localStorage.getItem(newStorageKey);
        if (stored) {
          const parsedMessages = JSON.parse(stored);
          if (Array.isArray(parsedMessages) && parsedMessages.length > 0) {
            console.log(`Loaded messages from ${newStorageKey}`);
            setMessages(parsedMessages);
          } else {
            // No messages for this URL, start fresh
            setMessages([]);
          }
        } else {
          // No messages for this URL, start fresh
          setMessages([]);
        }
      } catch (error) {
        console.error('Error loading messages for new location:', error);
        setMessages([]);
      }

      // Reset backend conversation for new URL
      if (socketRef.current) {
        socketRef.current.emit('reset_conversation');
        console.log('Reset conversation sent to backend for URL change');
      }

      lastLocationRef.current = currentPath;
    }
  }, [location.pathname, messages]);

  // Load messages from localStorage on initialization (only once)
  useEffect(() => {
    const storageKey = getStorageKey();
    try {
      const stored = localStorage.getItem(storageKey);
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

          console.log(`Loaded ${cleanedMessages.length} messages from ${storageKey}`);
          setMessages(cleanedMessages);
        }
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
      localStorage.removeItem(storageKey);
    }
  }, []); // Only run once on mount

  // Save messages to localStorage whenever messages change (debounced)
  useEffect(() => {
    // Don't save empty arrays or arrays with only welcome messages
    if (
      messages.length === 0 ||
      (messages.length === 1 && messages[0].text?.includes('Welcome to ChatRecipe'))
    ) {
      return;
    }

    const storageKey = getStorageKey();
    const timeoutId = setTimeout(() => {
      try {
        const messagesJson = JSON.stringify(messages);

        // Check storage size limit
        if (messagesJson.length > MAX_STORAGE_SIZE) {
          // Keep only recent messages if storage is too large
          const recentMessages = messages.slice(-50);
          const recentJson = JSON.stringify(recentMessages);
          localStorage.setItem(storageKey, recentJson);
        } else {
          localStorage.setItem(storageKey, messagesJson);
        }
      } catch (error) {
        console.error('Error saving chat history:', error);
        // If storage is full, try to save only recent messages
        try {
          const recentMessages = messages.slice(-20);
          localStorage.setItem(storageKey, JSON.stringify(recentMessages));
        } catch (fallbackError) {
          console.error('Failed to save even recent messages:', fallbackError);
        }
      }
    }, 500); // Debounce saves by 500ms

    return () => clearTimeout(timeoutId);
  }, [messages, location.pathname]);

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
    // Stop any ongoing streams first
    if (socketRef.current) {
      socketRef.current.emit('stop_stream');
      console.log('Stop stream sent before clearing messages');
    }

    setMessages([]);
    const storageKey = getStorageKey();
    try {
      localStorage.removeItem(storageKey);
      console.log(`Cleared storage for ${storageKey}`);
    } catch (error) {
      console.error('Error clearing localStorage:', error);
    }

    // Reset conversation history on backend
    if (socketRef.current) {
      socketRef.current.emit('reset_conversation');
      console.log('Reset conversation sent to backend');
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
