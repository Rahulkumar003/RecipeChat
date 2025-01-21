import React, { useState, useRef, useEffect, useContext } from 'react';
import ChatMessage from './ChatMessage';
import { ChatContext } from '../context/chatContext';
import { MdSend } from 'react-icons/md';
import { io } from 'socket.io-client';
// http://192.168.3.31:3000
// Ensure socket connection with specific options
const socket = io('http://192.168.3.31:5000', {
  transports: ['websocket', 'polling'],
});

const NewChatView = () => {
  const messagesEndRef = useRef();
  const inputRef = useRef();
  const [formValue, setFormValue] = useState('');
  const [messages, addMessage] = useContext(ChatContext);
  const [isFetchingRecipe, setIsFetchingRecipe] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentAIMessageId, setCurrentAIMessageId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  // Add initial welcome message on component mount (only once)
  useEffect(() => {
    const welcomeMessage = {
      id: `msg_welcome_${Date.now()}`,
      createdAt: Date.now(),
      text: "👋 Welcome to ChatRecipe! Share a YouTube cooking video link, and I'll break down the recipe for you.",
      ai: true,
    };

    // Only add welcome message if no messages exist
    addMessage((prevMessages) => (prevMessages.length === 0 ? [welcomeMessage] : prevMessages));
  }, []);

  // Enhanced socket event listener
  useEffect(() => {
    socket.on('response', (data) => {
      if (data.error) {
        console.error('Socket error:', data.error);

        // Remove loading message
        if (loadingMessage) {
          addMessage((prevMessages) => prevMessages.filter((msg) => msg.id !== loadingMessage));
        }

        addMessage({
          id: `msg_error_${Date.now()}`,
          createdAt: Date.now(),
          text: `Error: ${data.error}`,
          ai: true,
        });
        setIsStreaming(false);
        setIsLoading(false);
        setCurrentAIMessageId(null);
        setLoadingMessage('');
      } else if (data.complete) {
        console.log('Text generation complete');
        setIsStreaming(false);
        setIsLoading(false);
        setCurrentAIMessageId(null);
      } else if (data.streaming) {
        // Debugging: Log the incoming data
        console.log('Streaming data received:', data.data);

        // Remove loading message
        if (loadingMessage) {
          addMessage((prevMessages) => prevMessages.filter((msg) => msg.id !== loadingMessage));
          setLoadingMessage('');
        }

        // Remove loading state when first data arrives
        setIsLoading(false);

        addMessage((prevMessages) => {
          // If no current AI message ID, create a new message
          if (!currentAIMessageId) {
            const newMessageId = `msg_stream_${Date.now()}`;
            setCurrentAIMessageId(newMessageId);
            return [
              ...prevMessages,
              {
                id: newMessageId,
                createdAt: Date.now(),
                text: data.data,
                ai: true,
                complete: false,
              },
            ];
          }

          // Update existing streaming message
          return prevMessages.map((msg) =>
            msg.id === currentAIMessageId
              ? {
                  ...msg,
                  text: (msg.text || '') + data.data,
                }
              : msg,
          );
        });
        scrollToBottom();
      }
    });

    return () => {
      socket.off('response');
    };
  }, [currentAIMessageId, loadingMessage]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => {
    // Socket listener for recipe streaming
    socket.on('recipe_stream', (data) => {
      if (data.error) {
        console.error('Recipe fetch error:', data.error);

        // Remove loading message
        if (loadingMessage) {
          addMessage((prevMessages) => prevMessages.filter((msg) => msg.id !== loadingMessage));
        }

        addMessage({
          id: `msg_error_${Date.now()}`,
          createdAt: Date.now(),
          text: `Error fetching recipe: ${data.error}`,
          ai: true,
        });
        setIsStreaming(false);
        setIsLoading(false);
        setCurrentAIMessageId(null);
        setLoadingMessage('');
      } else if (data.complete) {
        console.log('Recipe fetch complete');
        setIsStreaming(false);
        setIsFetchingRecipe(false);
        setIsLoading(false);
        setCurrentAIMessageId(null);
      } else if (data.streaming) {
        // Remove loading message
        if (loadingMessage) {
          addMessage((prevMessages) => prevMessages.filter((msg) => msg.id !== loadingMessage));
          setLoadingMessage('');
        }

        // Remove loading state when first data arrives
        setIsLoading(false);

        addMessage((prevMessages) => {
          // If no current AI message ID, create a new message
          if (!currentAIMessageId) {
            const newMessageId = `msg_recipe_${Date.now()}`;
            setCurrentAIMessageId(newMessageId);
            return [
              ...prevMessages,
              {
                id: newMessageId,
                createdAt: Date.now(),
                text: data.data,
                ai: true,
                complete: false,
              },
            ];
          }

          // Update existing streaming message
          return prevMessages.map((msg) =>
            msg.id === currentAIMessageId
              ? {
                  ...msg,
                  text: (msg.text || '') + data.data,
                }
              : msg,
          );
        });
        scrollToBottom();
      }
    });

    return () => {
      socket.off('recipe_stream');
    };
  }, [currentAIMessageId, loadingMessage]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formValue) return;

    const cleanInput = formValue.trim();
    setFormValue('');

    // Add user message
    addMessage({
      id: `msg_user_${Date.now()}`,
      createdAt: Date.now(),
      text: cleanInput,
      ai: false,
    });

    // Set loading state and loading message
    setIsLoading(true);
    setIsStreaming(true);

    // Set different loading messages based on context
    const loadingText = isFetchingRecipe ? 'Fetching recipe details...' : 'Generating response...';

    // Add a loading message
    const loadingMessageId = `msg_loading_${Date.now()}`;
    addMessage({
      id: loadingMessageId,
      createdAt: Date.now(),
      text: loadingText,
      ai: true,
      isLoading: true,
    });
    setLoadingMessage(loadingMessageId);

    if (isFetchingRecipe) {
      // Start streaming recipe fetch
      socket.emit('fetch_recipe_stream', { video_url: cleanInput });
    } else {
      socket.emit('generate_text', { prompt: cleanInput });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming) handleSubmit(e);
    }
  };

  const handleChange = (e) => setFormValue(e.target.value);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    inputRef.current.focus();
  }, []);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 min-h-[calc(100vh-2rem)] flex flex-col max-w-3xl mx-auto">
      <main className="flex-grow overflow-y-auto space-y-4 mb-4">
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}
        <span ref={messagesEndRef}></span>
      </main>

      <form
        onSubmit={handleSubmit}
        className="sticky bottom-0 bg-white dark:bg-gray-800 pt-4 border-t border-gray-200 dark:border-gray-700"
      >
        <div className="flex items-stretch bg-gray-50 dark:bg-gray-700 rounded-xl overflow-hidden">
          <textarea
            ref={inputRef}
            className="
              w-full 
              p-3 
              bg-transparent 
              text-gray-800 
              dark:text-gray-200 
              outline-none 
              resize-none 
              max-h-32
            "
            rows={1}
            value={formValue}
            onKeyDown={handleKeyDown}
            onChange={handleChange}
            placeholder={isFetchingRecipe ? 'Enter YouTube video URL' : 'Ask a question'}
            disabled={isStreaming}
          />
          <button
            type="submit"
            className={`
              p-3 
              ${
                formValue && !isStreaming
                  ? 'text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900'
                  : 'text-gray-400'
              }
              transition-colors
            `}
            disabled={!formValue || isStreaming}
          >
            <MdSend size={24} />
          </button>
        </div>
      </form>
    </div>
  );
};

export default NewChatView;
