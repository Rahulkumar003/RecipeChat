import React, { useState, useRef, useEffect, useContext } from 'react';
import ChatMessage from './ChatMessage';
import { ChatContext } from '../context/chatContext';
import { MdSend, MdStop } from 'react-icons/md';
import { io } from 'socket.io-client';

//socket connection :
const socket = io('https://backend-released-recipechat.onrender.com', {
  transports: ['websocket', 'polling'],
});

// Add after socket initialization
socket.on('connect', () => {
  console.log('Connected to backend');
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
});

const NewChatView = () => {
  const messagesEndRef = useRef();
  const inputRef = useRef();
  const [formValue, setFormValue] = useState('');
  const [messages, addMessage, clearMessages] = useContext(ChatContext); // Add clearMessages here
  const [isFetchingRecipe, setIsFetchingRecipe] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentAIMessageId, setCurrentAIMessageId] = useState(null);
  const [loadingMessage, setLoadingMessage] = useState('');

  const resetChat = () => {
    // Stop any ongoing generation
    if (isStreaming) {
      socket.emit('stop_generation');
    }
    
    // Reset all states
    setFormValue('');
    setIsFetchingRecipe(true); // Important: Always set to true for new chat
    setIsStreaming(false);
    setCurrentAIMessageId(null);
    setLoadingMessage('');
    
    // Disconnect and reconnect socket
    socket.disconnect();
    socket.connect();

    // Clear messages - This will add the initial welcome message from ChatContext
    clearMessages();

    // Focus the input field
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };
  // Update the initialization useEffect
  useEffect(() => {
    resetChat(); // Use the same resetChat function for initialization
    return () => {
      socket.disconnect();
    };
  }, [resetChat]);

  // Update the useEffect for storage event listener
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'clearChat') {
        resetChat();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [resetChat]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Enhanced socket event listener
  useEffect(() => {
    const handleResponse = (data) => {
      console.log('Received response:', data);

      if (data.error) {
        console.error('Socket error:', data.error);

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
        setCurrentAIMessageId(null);
        setLoadingMessage('');
      } else if (data.complete) {
        setIsStreaming(false);
        setCurrentAIMessageId(null);
        setIsFetchingRecipe(false);
      } else if (data.streaming) {
        if (loadingMessage) {
          addMessage((prevMessages) => prevMessages.filter((msg) => msg.id !== loadingMessage));
          setLoadingMessage('');
        }

        addMessage((prevMessages) => {
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
    };

    socket.on('response', handleResponse);
    return () => socket.off('response', handleResponse);
  }, [currentAIMessageId, loadingMessage, addMessage]);

  // Recipe stream listener
  useEffect(() => {
    const handleRecipeStream = (data) => {
      console.log('Received recipe chunk:', data);

      if (data.error) {
        console.error('Recipe fetch error:', data.error);

        if (loadingMessage) {
          addMessage((prevMessages) => 
            prevMessages.filter((msg) => msg.id !== loadingMessage)
          );
        }

        // More user-friendly error message
        const errorMessage = data.error.includes('Working outside of request context') 
          ? "Sorry, there was an error connecting to the server. Please try again."
          : `Error fetching recipe: ${data.error}`;

        addMessage({
          id: `msg_error_${Date.now()}`,
          createdAt: Date.now(),
          text: errorMessage,
          ai: true,
        });
        
        setIsStreaming(false);
        setCurrentAIMessageId(null);
        setLoadingMessage('');
        setIsFetchingRecipe(true); // Reset to allow trying again
      } else if (data.complete) {
        setIsStreaming(false);
        setIsFetchingRecipe(false);
        setCurrentAIMessageId(null);
      } else if (data.streaming) {
        if (loadingMessage) {
          addMessage((prevMessages) => prevMessages.filter((msg) => msg.id !== loadingMessage));
          setLoadingMessage('');
        }

        addMessage((prevMessages) => {
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
    };

    socket.on('recipe_stream', handleRecipeStream);
    return () => socket.off('recipe_stream', handleRecipeStream);
  }, [currentAIMessageId, loadingMessage, addMessage]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formValue) return;

    const cleanInput = formValue.trim();
    setFormValue('');

    addMessage({
      id: `msg_user_${Date.now()}`,
      createdAt: Date.now(),
      text: cleanInput,
      ai: false,
    });

    setIsStreaming(true);
    const loadingText = isFetchingRecipe ? 'Fetching recipe details...' : 'Generating response...';
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

  const stopGeneration = () => {
    socket.emit('stop_generation');
    setIsStreaming(false);
    setCurrentAIMessageId(null);
    if (loadingMessage) {
      addMessage((prevMessages) => prevMessages.filter((msg) => msg.id !== loadingMessage));
      setLoadingMessage('');
    }
  };

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
            className="w-full p-3 bg-transparent text-gray-800 dark:text-gray-200 outline-none resize-none max-h-32"
            rows={1}
            value={formValue}
            onKeyDown={handleKeyDown}
            onChange={(e) => setFormValue(e.target.value)}
            placeholder={
              isStreaming
                ? 'Answer is being generated...'
                : isFetchingRecipe
                ? 'Enter YouTube video URL'
                : 'Ask a question'
            }
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={stopGeneration}
              className="p-3 text-red-600 hover:bg-red-50 dark:hover:bg-red-900 transition-colors"
              title="Stop generating"
            >
              <MdStop size={24} />
            </button>
          ) : (
            <button
              type="submit"
              className={`p-3 ${
                formValue
                  ? 'text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900'
                  : 'text-gray-400'
              } transition-colors`}
              disabled={!formValue}
            >
              <MdSend size={24} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default NewChatView;
