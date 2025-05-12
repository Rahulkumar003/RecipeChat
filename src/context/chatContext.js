import React, { createContext, useState } from 'react';

const ChatContext = createContext({});

const ChatContextProvider = (props) => {
  const initialMsg = {
    id: 1,
    createdAt: Date.now(),
    text: "👋 Please share a YouTube cooking video link to get started! I'll help break down the recipe for you.",
    ai: true,
  };

  const [messages, setMessages] = useState([initialMsg]);

  const addMessage = (messageOrCallback) => {
    setMessages((prevMessages) => {
      if (typeof messageOrCallback === 'function') {
        return messageOrCallback(prevMessages);
      }
      const isDuplicate = prevMessages.some(
        (msg) => msg.text === messageOrCallback.text && msg.ai === messageOrCallback.ai,
      );
      return isDuplicate ? prevMessages : [...prevMessages, messageOrCallback];
    });
  };

  const clearMessages = () => {
    setMessages([initialMsg]);
  };

  return (
    <ChatContext.Provider value={[messages, addMessage, clearMessages]}>
      {props.children}
    </ChatContext.Provider>
  );
};

export { ChatContext, ChatContextProvider };
