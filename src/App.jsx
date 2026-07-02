import { useState } from 'react';
import SpyPanelPage from './pages/SpyPanelPage';
import DeepHistoryGspcPage from './pages/DeepHistoryGspcPage';
import './App.css';

const TABS = {
  spy: { label: 'SPY', Component: SpyPanelPage },
  deepHistory: { label: 'Deep History — GSPC', Component: DeepHistoryGspcPage },
};

export default function App() {
  const [tab, setTab] = useState('spy');
  const { Component } = TABS[tab];

  return (
    <div className="app">
      <nav className="tab-bar">
        {Object.entries(TABS).map(([key, { label }]) => (
          <button
            key={key}
            type="button"
            className={key === tab ? 'tab-button tab-button--active' : 'tab-button'}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      <main>
        <Component />
      </main>
    </div>
  );
}
