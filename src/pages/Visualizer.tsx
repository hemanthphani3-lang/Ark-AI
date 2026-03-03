import React, { useState, useMemo, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, ContactShadows, Sky } from '@react-three/drei';
import { useAppState } from '@/context/AppContext';
import { Rotate3d, Layers, Palette, Shield, Info, Maximize2, Move } from 'lucide-react';
import * as THREE from 'three';

// Import our existing logic (conceptual - since those files were standalone pages, 
// we'll bring the core components here or import them if they were modularized)
// For this implementation, I will bring the core logic into local sub-components 
// to ensure a perfectly integrated experience.

import Visualization3D from './Visualization3D';
import FinalLook from './FinalLook';

type ViewMode = 'structural' | 'finished';

const Visualizer = () => {
    const { state, floorPlanSaved } = useAppState();
    const [mode, setMode] = useState<ViewMode>('structural');
    const [isFullscreen, setIsFullscreen] = useState(false);

    if (!floorPlanSaved) {
        return (
            <div className="flex flex-col items-center justify-center h-[80vh] text-center space-y-6 animate-fade-in">
                <div className="p-6 rounded-full bg-primary/5 border border-primary/20">
                    <Layers className="h-12 w-12 text-primary/40" />
                </div>
                <div className="space-y-2">
                    <h2 className="text-2xl font-bold tracking-tight">Visualizer Locked</h2>
                    <p className="text-muted-foreground max-w-md"> Please save a floor plan in the Studio section to unlock the immersive 3D Visualizer.</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`relative w-full overflow-hidden rounded-3xl border border-border bg-black shadow-2xl transition-all duration-700 ${isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'h-[85vh]'}`}>

            {/* Top Navigation Overlay */}
            <div className="absolute top-6 left-6 right-6 z-[9999] flex justify-between items-start pointer-events-none">
                <div className="pointer-events-auto space-y-1">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 bg-black/40">
                            <Rotate3d className="h-5 w-5 text-primary" />
                        </div>
                        <h1 className="text-xl font-black uppercase tracking-[0.2em] text-white">Visualizer Studio</h1>
                    </div>
                    <p className="text-[10px] text-primary font-bold uppercase tracking-widest ml-12 opacity-80">
                        {mode === 'structural' ? 'Structural & Load Distribution View' : 'Finished Interior & Material Preview'}
                    </p>
                </div>

                <div className="flex flex-col items-end gap-3 pointer-events-auto">
                    {/* Mode Toggle Switcer */}
                    <div className="bg-black/80 border border-white/20 p-1 rounded-2xl flex gap-1 shadow-2xl">
                        <button
                            onClick={() => setMode('structural')}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all duration-500 ${mode === 'structural' ? 'bg-primary text-black font-black shadow-lg' : 'text-white/80 hover:text-white hover:bg-white/10'}`}
                        >
                            <Shield className="h-4 w-4" />
                            <span className="text-[10px] uppercase tracking-wider">Structural</span>
                        </button>
                        <button
                            onClick={() => setMode('finished')}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all duration-500 ${mode === 'finished' ? 'bg-primary text-black font-black shadow-lg' : 'text-white/80 hover:text-white hover:bg-white/10'}`}
                        >
                            <Palette className="h-4 w-4" />
                            <span className="text-[10px] uppercase tracking-wider">Finished</span>
                        </button>
                    </div>

                    <button
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className="p-3 rounded-full bg-black/80 border border-white/20 text-white hover:bg-primary hover:text-black transition-all shadow-xl"
                    >
                        <Maximize2 className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Main Canvas View */}
            <div className="w-full h-full relative z-0">
                {mode === 'structural' ? (
                    <Visualization3D />
                ) : (
                    <FinalLook />
                )}
            </div>

            {/* Bottom Info Bar */}
            < div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 w-auto px-8 py-4 bg-black/80 border border-white/20 rounded-full flex gap-10 items-center justify-center shadow-2xl animate-fade-in pointer-events-auto" >
                <div className="flex items-center gap-3">
                    <Move className="h-4 w-4 text-primary" />
                    <span className="text-[10px] font-black uppercase text-white/80 tracking-widest whitespace-nowrap">Rotate: Left Mouse</span>
                </div>
                <div className="h-4 w-[1px] bg-white/10" />
                <div className="flex items-center gap-3">
                    <Maximize2 className="h-4 w-4 text-primary" />
                    <span className="text-[10px] font-black uppercase text-white/80 tracking-widest whitespace-nowrap">Zoom: Scroll</span>
                </div>
                {
                    mode === 'finished' && (
                        <>
                            <div className="h-4 w-[1px] bg-white/10" />
                            <div className="flex items-center gap-3">
                                <Layers className="h-4 w-4 text-primary" />
                                <span className="text-[10px] font-black uppercase text-white/80 tracking-widest whitespace-nowrap">Themes available in Sidebar</span>
                            </div>
                        </>
                    )
                }
            </div >

            {/* Corner Decorative Elements */}
            < div className="absolute bottom-0 left-0 w-32 h-32 bg-primary/20 blur-[100px] pointer-events-none opacity-40" />
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 blur-[100px] pointer-events-none opacity-40" />
        </div >
    );
};

export default Visualizer;
