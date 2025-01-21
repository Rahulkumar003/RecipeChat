import React, { useState, useContext, useEffect } from 'react';
import { MdChevronLeft, MdChevronRight, MdAdd, MdOutlineSettings } from 'react-icons/md';
import { ChatContext } from '../context/chatContext';
import logo from '../assets/logo.png';
import Modal from './Modal';
import Setting from './Setting';

const SideBar = () => {
  const [open, setOpen] = useState(true);
  const [, , clearMessages] = useContext(ChatContext);
  const [modalOpen, setModalOpen] = useState(false);

  function handleResize() {
    window.innerWidth <= 720 ? setOpen(false) : setOpen(true);
  }

  useEffect(() => {
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const clearChat = () => clearMessages();

  return (
    <aside
      className={`
        bg-white 
        dark:bg-gray-800 
        h-screen 
        fixed 
        left-0 
        top-0 
        z-40 
        shadow-lg 
        border-r 
        border-gray-200 
        dark:border-gray-700 
        transition-all 
        duration-300 
        ${open ? 'w-64 lg:w-80' : 'w-16'}
        overflow-hidden
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div
          className={`flex items-center transition-all ${!open ? 'opacity-0 w-0' : 'opacity-100'}`}
        >
          <img src={logo} alt="RecipeHelper Logo" className="w-9 h-9 mr-2 rounded-full" />
          <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-200">ChatRecipe</h1>
        </div>

        <button
          onClick={() => setOpen(!open)}
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          {open ? (
            <MdChevronLeft className="w-6 h-6 text-gray-600 dark:text-gray-300" />
          ) : (
            <MdChevronRight className="w-6 h-6 text-gray-600 dark:text-gray-300" />
          )}
        </button>
      </div>

      {/* New Chat Button */}
      <div className="p-2 mt-4">
        <div
          onClick={clearChat}
          className={`
            border 
            border-gray-200 
            dark:border-gray-700 
            rounded-lg 
            flex 
            items-center 
            p-2 
            cursor-pointer 
            hover:bg-gray-100 
            dark:hover:bg-gray-700 
            transition-colors 
            group
          `}
        >
          <div className="p-2 bg-blue-50 dark:bg-blue-900 rounded-full mr-2">
            <MdAdd className="w-5 h-5 text-blue-600 dark:text-blue-300" />
          </div>
          <span
            className={`
            text-gray-800 
            dark:text-gray-200 
            ${!open && 'hidden'}
            group-hover:text-blue-600 
            dark:group-hover:text-blue-300 
            transition-colors
          `}
          >
            New Chat
          </span>
        </div>
      </div>

      {/* Settings */}
      <div className="absolute bottom-0 left-0 right-0 p-2">
        <div onClick={() => setModalOpen(true)} className="cursor-pointer">
          <div
            className={`
              flex 
              items-center 
              p-2 
              rounded-lg 
              hover:bg-gray-100 
              dark:hover:bg-gray-700 
              transition-colors 
              group
            `}
          >
            <div className="p-2 bg-gray-50 dark:bg-gray-900 rounded-full mr-2">
              <MdOutlineSettings className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </div>
            <span
              className={`
              text-gray-800 
              dark:text-gray-200 
              ${!open && 'hidden'}
              group-hover:text-blue-600 
              dark:group-hover:text-blue-300 
              transition-colors
            `}
            >
              Settings
            </span>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <Modal title="Settings" modalOpen={modalOpen} setModalOpen={setModalOpen}>
        <Setting modalOpen={modalOpen} setModalOpen={setModalOpen} />
      </Modal>
    </aside>
  );
};

export default SideBar;
