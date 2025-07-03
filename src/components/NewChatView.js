import React, { useState, useRef, useEffect, useContext } from 'react';
import { useParams } from 'react-router-dom';
import ChatMessage from './ChatMessage';
import { ChatContext } from '../context/chatContext';
import { MdSend } from 'react-icons/md';
import { io } from 'socket.io-client';

const NewChatView = () => {
  const { videoUrl } = useParams();
  const messagesEndRef = useRef();
  const inputRef = useRef();
  const socketRef = useRef(null);
  const [formValue, setFormValue] = useState('');
  const [messages, addMessage] = useContext(ChatContext);
  const [isFetchingRecipe, setIsFetchingRecipe] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentAIMessageId, setCurrentAIMessageId] = useState(null);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [isRecipeFetchInProgress, setIsRecipeFetchInProgress] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [isNewChatInitiated, setIsNewChatInitiated] = useState(false);
  const [hasVideoUrlError, setHasVideoUrlError] = useState(false);
  const [processedVideoUrl, setProcessedVideoUrl] = useState(null); // Track processed URLs

  // Function to clean text formatting
  const cleanText = (text) => {
    return text
      .replace(/\n{3,}/g, '\n\n') // Replace 3+ consecutive line breaks with just 2
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n');
  };

  // Scroll to bottom when messages change IF AUTO-SCROLL is enabled
  useEffect(() => {
    if (shouldAutoScroll) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [messages, shouldAutoScroll]);

  // Check if user is near bottom of chat
  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    // isNearBottom = user is within 100px of bottom
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShouldAutoScroll(isNearBottom);
  };

  // Initialize socket connection once
  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io('http://192.168.1.203:5000', {
        transports: ['websocket', 'polling'],
      });

      socketRef.current.on('connect', () => {
        console.log('Connected to backend');
      });

      socketRef.current.on('connect_error', (error) => {
        console.error('Connection error:', error);
      });
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  // Check if we already have recipe data in the conversation to set initial state correctly
  useEffect(() => {
    // Check if there are messages that indicate a recipe has already been fetched
    const hasRecipeContent = messages.some(
      (msg) =>
        msg.ai &&
        (msg.text.includes('**Title**') ||
          msg.text.includes('**Ingredients**') ||
          msg.text.includes('**Procedure**') ||
          msg.text.includes('Recipe Assistant')),
    );

    // Only set isFetchingRecipe to false if we have actual recipe content, not just error messages
    if (hasRecipeContent) {
      setIsFetchingRecipe(false);
    }

    // Check if we have a message that was recovered from incomplete state
    const hasRecoveredMessage = messages.some((msg) => msg.wasIncompleteOnReload);
    if (hasRecoveredMessage) {
      // Reset streaming states to prevent continuation issues
      setIsStreaming(false);
      setCurrentAIMessageId(null);
      setLoadingMessage('');
      setIsRecipeFetchInProgress(false);

      // Remove the flag after handling to prevent repeated resets
      setTimeout(() => {
        addMessage((prevMessages) =>
          prevMessages.map((msg) =>
            msg.wasIncompleteOnReload ? { ...msg, wasIncompleteOnReload: undefined } : msg,
          ),
        );
      }, 100);
    }
  }, [messages]);

  // Reset all state when messages are cleared (New Chat functionality)
  useEffect(() => {
    // If messages array becomes empty or only has welcome message, reset all state
    if (
      messages.length === 0 ||
      (messages.length === 1 && messages[0].text?.includes('Welcome to ChatRecipe'))
    ) {
      setIsFetchingRecipe(true);
      setIsStreaming(false);
      setCurrentAIMessageId(null);
      setLoadingMessage('');
      setIsRecipeFetchInProgress(false);
      setFormValue('');
      setShouldAutoScroll(true);
      setIsNewChatInitiated(true);
      setHasVideoUrlError(false);
    }
  }, [messages]);

  // Add initial welcome message on component mount (only if no messages exist)
  useEffect(() => {
    const welcomeMessage = {
      id: `msg_welcome_${Date.now()}`,
      createdAt: Date.now(),
      text: "👋 Welcome to ChatRecipe! Share a YouTube cooking video link, and I'll break down the recipe for you.",
      ai: true,
    };

    addMessage((prevMessages) => (prevMessages.length === 0 ? [welcomeMessage] : prevMessages));
  }, []);

  // Auto-fetch recipe if video URL is in route params
  useEffect(() => {
    if (
      videoUrl &&
      messages.length <= 1 &&
      !isRecipeFetchInProgress &&
      !isStreaming &&
      socketRef.current &&
      !isNewChatInitiated
    ) {
      // Auto-fetch recipe for video URL
      console.log(`Auto-fetching recipe for URL: ${videoUrl}`);
      setIsRecipeFetchInProgress(true);
      const decodedUrl = decodeURIComponent(videoUrl);

      // Add user message showing the URL
      addMessage({
        id: `msg_user_${Date.now()}`,
        createdAt: Date.now(),
        text: decodedUrl,
        ai: false,
      });

      // Start fetching recipe
      setIsStreaming(true);
      const loadingMessageId = `msg_loading_${Date.now()}`;

      addMessage({
        id: loadingMessageId,
        createdAt: Date.now(),
        text: 'Fetching recipe details...',
        ai: true,
        isLoading: true,
      });
      setLoadingMessage(loadingMessageId);

      socketRef.current.emit('fetch_recipe_stream', { video_url: decodedUrl });
      setProcessedVideoUrl(videoUrl);
    }
  }, [videoUrl, messages.length, isRecipeFetchInProgress, isStreaming, isNewChatInitiated]);

  // Reset states when video URL changes
  useEffect(() => {
    if (videoUrl && processedVideoUrl !== videoUrl) {
      console.log(`Video URL changed to: ${videoUrl}, resetting states`);
      setIsNewChatInitiated(false);
      setIsFetchingRecipe(true);
      setIsStreaming(false);
      setCurrentAIMessageId(null);
      setLoadingMessage('');
      setIsRecipeFetchInProgress(false);
      setHasVideoUrlError(false);
      setProcessedVideoUrl(videoUrl);
    }

    // Handle navigation to home page
    if (!videoUrl && processedVideoUrl) {
      console.log('Navigated to home page, resetting states');
      setProcessedVideoUrl(null);
      setIsFetchingRecipe(true);
      setHasVideoUrlError(false);
    }
  }, [videoUrl, processedVideoUrl]);

  // Enhanced socket event listener
  useEffect(() => {
    if (!socketRef.current) return;

    const handleResponse = (data) => {
      console.log('Received response:', data);

      if (data.error) {
        console.error('Socket error:', data.error);

        // Clear loading message
        addMessage((prevMessages) => {
          return prevMessages.filter((msg) => !msg.isLoading);
        });
        setLoadingMessage('');

        addMessage({
          id: `msg_error_${Date.now()}`,
          createdAt: Date.now(),
          text: `Error: ${data.error}`,
          ai: true,
        });
        setIsStreaming(false);
        setCurrentAIMessageId(null);

        // Keep isFetchingRecipe as true if it's a video URL error to continue expecting video URL
        const errorMessage = data.error.toLowerCase();
        const isVideoUrlError =
          errorMessage.includes('video') ||
          errorMessage.includes('url') ||
          errorMessage.includes('extract') ||
          errorMessage.includes('id') ||
          errorMessage.includes('transcript');

        console.log('Error message:', data.error);
        console.log('Is video URL error:', isVideoUrlError);

        if (!isVideoUrlError) {
          setIsFetchingRecipe(false);
          setHasVideoUrlError(false);
        } else {
          // Ensure we're in recipe-fetching mode for video URL errors
          setIsFetchingRecipe(true);
          setHasVideoUrlError(true);
          console.log('Keeping in recipe-fetching mode due to video URL error');
        }
        setIsRecipeFetchInProgress(false);
      } else if (data.complete) {
        // Clear loading message and clean final text
        addMessage((prevMessages) => {
          return prevMessages
            .map((msg) => {
              if (msg.id === currentAIMessageId) {
                const finalText = cleanText(msg.text || '');

                // Check if the completed message is an error
                const isCompletedError =
                  finalText.toLowerCase().includes('transcript extraction failed') ||
                  finalText.toLowerCase().includes('could not extract video id') ||
                  finalText.toLowerCase().includes('video id not present') ||
                  finalText.toLowerCase().includes('invalid url');

                if (isCompletedError) {
                  console.log('Completed message is an error, maintaining recipe-fetching mode');
                  // Don't change isFetchingRecipe here, let the streaming handler manage it
                }

                return {
                  ...msg,
                  text: finalText,
                  complete: true,
                };
              }
              return msg;
            })
            .filter((msg) => !msg.isLoading);
        });
        setLoadingMessage('');
        setIsStreaming(false);
        setCurrentAIMessageId(null);

        // Only set isFetchingRecipe to false if it's not a video URL error
        if (!hasVideoUrlError) {
          setIsFetchingRecipe(false);
          setHasVideoUrlError(false);
        }
        setIsRecipeFetchInProgress(false);
      } else if (data.streaming) {
        // Clear loading message on first streaming data
        if (loadingMessage) {
          addMessage((prevMessages) => {
            return prevMessages.filter((msg) => !msg.isLoading);
          });
          setLoadingMessage('');
        }

        // Check if the streaming data contains an error message
        const isErrorInStream =
          data.data &&
          (data.data.toLowerCase().includes('transcript extraction failed') ||
            data.data.toLowerCase().includes('could not extract video id') ||
            data.data.toLowerCase().includes('video id not present') ||
            data.data.toLowerCase().includes('invalid url'));

        if (isErrorInStream) {
          console.log('Error detected in streaming data:', data.data);
          // Keep in recipe-fetching mode for video URL errors
          setIsFetchingRecipe(true);
          setHasVideoUrlError(true);
          console.log('Keeping in recipe-fetching mode due to video URL error in stream');
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
      }
    };

    const socket = socketRef.current;
    socket.on('response', handleResponse);
    socket.on('recipe_stream', handleResponse);

    return () => {
      if (socket) {
        socket.off('response', handleResponse);
        socket.off('recipe_stream', handleResponse);
      }
    };
  }, [currentAIMessageId, loadingMessage, addMessage, hasVideoUrlError]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formValue || !socketRef.current) return;

    const cleanInput = formValue.trim();
    setFormValue('');

    // Reset auto-scroll when user sends a message
    setShouldAutoScroll(true);

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

    if (isFetchingRecipe && !isRecipeFetchInProgress) {
      setIsRecipeFetchInProgress(true);
      socketRef.current.emit('fetch_recipe_stream', { video_url: cleanInput });
      // Reset video URL error state when submitting a new URL
      setHasVideoUrlError(false);
      setProcessedVideoUrl(cleanInput);
    } else {
      socketRef.current.emit('generate_text', { prompt: cleanInput });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming) handleSubmit(e);
    }
  };

  // Only scroll on initial load, not on every message change
  useEffect(() => {
    inputRef.current.focus();
  }, []);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-none sm:rounded-xl shadow-none sm:shadow-lg flex flex-col w-full max-w-3xl mx-auto h-full box-border p-1 sm:p-2">
      <main
        className="flex-grow overflow-y-auto space-y-2 sm:space-y-4 mb-2 sm:mb-4 w-full px-1 sm:px-2 pt-1"
        onScroll={handleScroll}
        style={{
          WebkitOverflowScrolling: 'touch',
          minWidth: 0,
          overscrollBehavior: 'contain',
        }}
      >
        <div className="flex flex-col w-full max-w-full">
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
          <span ref={messagesEndRef}></span>
        </div>
      </main>

      <form
        onSubmit={handleSubmit}
        className="sticky bottom-0 left-0 right-0 bg-white dark:bg-gray-800 p-2 sm:p-4 border-t border-gray-200 dark:border-gray-700 z-10 pb-2"
        style={{
          width: '100%',
          maxWidth: '100vw',
        }}
      >
        <div
          className="flex items-end bg-gray-50 dark:bg-gray-700 rounded-t-xl rounded-b-[1.1em] sm:rounded-xl w-full gap-1.5 sm:gap-3 px-1 xs:px-1 sm:px-2 py-1 xs:py-0.5 sm:py-1 transition-[padding] duration-200"
          style={{
            minHeight: '3rem',
            boxSizing: 'border-box',
            width: '100%',
            maxWidth: '100%',
            flex: 1,
            alignItems: 'flex-end',
          }}
        >
          <textarea
            ref={inputRef}
            className="flex-grow min-w-0 w-full px-1 py-1 xs:py-1.5 sm:py-2 bg-transparent text-gray-800 dark:text-gray-200 focus:bg-white/80 dark:focus:bg-gray-600/80 outline-none resize-none max-h-40 text-base xs:text-sm sm:text-base leading-relaxed rounded-md transition-[background] transition-colors duration-200 border border-transparent focus:border-blue-300 dark:focus:border-blue-800"
            rows={1}
            value={formValue}
            onKeyDown={handleKeyDown}
            onChange={(e) => setFormValue(e.target.value)}
            placeholder={
              isStreaming
                ? 'Answer is being generated...'
                : isFetchingRecipe
                ? hasVideoUrlError
                  ? 'Invalid YouTube URL. Please provide a valid one.'
                  : 'Enter YouTube video URL'
                : 'Ask a question'
            }
            disabled={isStreaming}
            style={{
              fontFamily: 'inherit',
              marginBottom: 0,
              boxSizing: 'border-box',
              minHeight: '2.5rem',
              maxHeight: '8rem',
              resize: 'none',
              width: '100%',
            }}
          />
          <button
            type="submit"
            className={`flex-shrink-0 px-3 xs:px-3 sm:px-3 py-2 xs:py-2.5 sm:py-3 ${
              formValue ? 'text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900' : 'text-gray-400'
            } transition-colors rounded-lg sm:rounded-xl`}
            disabled={!formValue}
            aria-label="Send"
            tabIndex={isStreaming ? -1 : 0}
            style={{
              minHeight: '2.75rem',
              minWidth: '2.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MdSend size={24} />
          </button>
        </div>
      </form>
    </div>
  );
};

export default NewChatView;
