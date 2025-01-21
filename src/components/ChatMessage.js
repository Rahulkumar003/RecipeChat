import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import moment from 'moment';
import person from '../assets/person.png';
import logo from '../assets/logo.png';

/**
 * A chat message component that displays a message with a timestamp and an icon.
 *
 * @param {Object} props - The properties for the component.
 */
const ChatMessage = (props) => {
  const { id, createdAt, text, ai = false, isLoading = false } = props.message;

  if (isLoading) {
    return (
      <div key={id} className="bg-[#eff6ff] flex-row-reverse message px-4 py-2">
        <div className="message__wrapper">
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-5 w-5 mr-2 border-t-2 border-blue-500"></div>
            <span className="text-gray-600">{text}</span>
          </div>
        </div>

        <div className="message__pic">
          <div className="avatar">
            <div className="w-8 border rounded-full">
              <img width="30" src={logo} alt="Logo" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div key={id} className={`${ai ? 'bg-[#eff6ff]' : ''} flex-row-reverse message px-4 py-2`}>
      <div className="message__wrapper">
        <ReactMarkdown
          className={'message__markdown text-left'}
          remarkPlugins={[[remarkGfm, { singleTilde: false }]]}
          components={{
            code({ node, inline, className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || 'language-js');
              return !inline && match ? (
                <SyntaxHighlighter style={oneDark} language={match[1]} PreTag="div" {...props}>
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              ) : (
                <code className={className} {...props}>
                  {children}{' '}
                </code>
              );
            },
          }}
        >
          {text}
        </ReactMarkdown>

        <div className="text-left message__createdAt">{moment(createdAt).calendar()}</div>
      </div>

      <div className="message__pic">
        <div className="avatar">
          <div className="w-8 border rounded-full">
            {ai ? <img width="30" src={logo} alt="Logo" /> : <img src={person} alt="profile pic" />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
