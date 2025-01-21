import React, { createContext, useState } from 'react';

const ChatContext = createContext({});

const ChatContextProvider = (props) => {
  const [messages, setMessages] = useState([]);

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
  };

  return (
    <ChatContext.Provider value={[messages, addMessage, clearMessages]}>
      {props.children}
    </ChatContext.Provider>
  );
};

export { ChatContext, ChatContextProvider };
