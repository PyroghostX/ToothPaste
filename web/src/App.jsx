import React, { useState, useContext, useEffect, useCallback } from "react";
import "./styles/index.css";
//import "./styles/global.css"; // Ensure global styles are applied
import { useRegisterSW } from 'virtual:pwa-register/react';
import Navbar from "./components/Navigation/Navbar";
import BulkSend from "./views/BulkSend";
import LiveCapture from "./views/LiveCapture";
import { BLEProvider } from "./context/BLEContext";
import ECDHOverlay from "./components/overlays/ECDHOverlay";
import UpdateController from "./components/overlays/UpdateOverlay";
import QuickStartOverlay from "./components/overlays/QuickStartOverlay";
import GridBackground from './components/shared/GridBackground';
import { ECDHContext, ECDHProvider } from "./context/ECDHContext";
import { DuckyscriptProvider } from "./context/DuckyscriptContext";
import About from "./views/about/About";


import ToothPaste from "./assets/ToothPaste.png";
import { Grid } from "@react-three/drei";

function App() {
    const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
        onRegisteredSW(_swUrl, registration) {
            // Force an update check every time the app opens
            registration?.update();
        },
    });
    const [isReloadingUpdate, setIsReloadingUpdate] = useState(false);
    const [showOverlay, setShowOverlay] = useState(false);
    const [showNavbar, setshowNavbar] = useState(true);
    const [activeView, setActiveView] = useState("live"); // control view here
    const [activeOverlay, setActiveOverlay] = useState(null); // 'ecdh', 'pairing', etc.
    const [overlayProps, setOverlayProps] = useState({});
  
    const overlays = {
      pair: ECDHOverlay,
      update: UpdateController,
      quickstart: QuickStartOverlay,
    };

    const ActiveOverlay = activeOverlay ? overlays[activeOverlay] : null;

    useEffect(() => {
      const hasSeenQuickstart = localStorage.getItem('quickstart_viewed');
      if (!hasSeenQuickstart) {
        setActiveOverlay('quickstart');
      }
    }, []);

    const handleReloadUpdate = useCallback(() => {
      if (isReloadingUpdate) return;
      setIsReloadingUpdate(true);

      let hasReloaded = false;
      const reloadOnce = () => {
        if (hasReloaded) return;
        hasReloaded = true;
        window.location.reload();
      };

      navigator.serviceWorker?.addEventListener('controllerchange', reloadOnce, { once: true });

      try {
        updateServiceWorker(true);
      } catch (error) {
        console.error('[App] Failed to activate service worker update:', error);
      }

      window.setTimeout(reloadOnce, 1500);
    }, [isReloadingUpdate, updateServiceWorker]);

    const renderView = () => {
        switch (activeView) {
            case "paste":
                return <BulkSend />;
            case "live":
                return <LiveCapture />;
            case "about":
                return <About />;
            default:
                return <BulkSend />;
        }
    };

    return (
    <DuckyscriptProvider>
      <ECDHProvider>
        <BLEProvider setShowOverlay={setShowOverlay} showOverlay={showOverlay}>
          <div className="flex flex-col h-dvh overflow-hidden bg-background relative">
            {/* Navbar - top layer */}
            <Navbar
              showNavbar={showNavbar}
              setshowNavbar={setshowNavbar}
              onNavigate={setActiveView}
              onChangeOverlay={setActiveOverlay}
              activeOverlay={activeOverlay}
              activeView={activeView}
              className="relative z-50"
            />

            {/* Main content area - middle layer */}
            <main className="flex flex-col flex-1 overflow-auto min-h-0 relative z-0 bg-transparent">

              {renderView()}
                          <GridBackground
                filledSquares={[]}
                squareSize={25}
                borderColor="rgba(255, 255, 255, 0.1)"
                borderWidth={1}
                className="z-0"
              />
            </main>

            {/* Overlay */}
            {ActiveOverlay && (
              <ActiveOverlay
                {...overlayProps}
                onChangeOverlay={setActiveOverlay}
                activeView={activeView}
              />
            )}

            {/* PWA update toast */}
            {needRefresh && (
              <div className="fixed bottom-4 right-4 bg-ink border border-primary rounded-lg p-3 flex items-center gap-3 z-50 shadow-lg">
                <span className="text-text text-sm">Update available</span>
                <button
                  onClick={handleReloadUpdate}
                  disabled={isReloadingUpdate}
                  className="text-primary text-sm font-semibold hover:text-text transition-colors"
                >
                  {isReloadingUpdate ? 'Reloading...' : 'Reload'}
                </button>
              </div>
            )}
          </div>
        </BLEProvider>
      </ECDHProvider>
    </DuckyscriptProvider>
    );
}

export default App
