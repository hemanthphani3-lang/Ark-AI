import { useEffect } from "react";

const ClickAnimation = () => {
    useEffect(() => {
        let lastClick = 0;
        const handleClick = (e: MouseEvent) => {
            if (document.pointerLockElement) return;

            const now = Date.now();
            if (now - lastClick < 100) return; // Throttle to 10fps for ripples
            lastClick = now;

            if (document.querySelectorAll(".click-ripple").length > 5) return;

            const ripple = document.createElement("div");
            ripple.className = "click-ripple";
            ripple.style.left = `${e.clientX}px`;
            ripple.style.top = `${e.clientY}px`;
            document.body.appendChild(ripple);

            ripple.addEventListener("animationend", () => {
                ripple.remove();
            });
        };

        window.addEventListener("click", handleClick);
        return () => window.removeEventListener("click", handleClick);
    }, []);

    return null;
};

export default ClickAnimation;
