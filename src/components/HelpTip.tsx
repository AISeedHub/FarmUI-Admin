import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';
import './HelpTip.css';

// A "?" next to a field label that reveals a short guide on hover / focus / tap.
// The card is portalled to <body> with fixed positioning so it can never be clipped
// by a modal's scrolling body — the same trick the copy-from preview popover uses.
interface HelpTipProps {
    label: string;      // accessible name of the button, e.g. "What is this?"
    children: ReactNode; // the guide itself
    width?: number;
}

const MARGIN = 10;

interface TipPos {
    top: number;
    left: number;
    measured: boolean; // false = first paint at the naive position, still to be checked
}

export default function HelpTip({ label, children, width = 340 }: HelpTipProps) {
    const btnRef = useRef<HTMLButtonElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<TipPos | null>(null);
    // Bề rộng thực tế: trên màn hẹp (360px) thẻ 340px sẽ chạm sát cả hai lề, và
    // ở dưới 360px thì tràn hẳn ra ngoài. Đo lại mỗi lần mở, vì thẻ đã tự đóng
    // khi resize nên không cần theo dõi liên tục.
    const [shownWidth, setShownWidth] = useState(width);

    const open = () => {
        const r = btnRef.current?.getBoundingClientRect();
        if (!r) return;
        const w = Math.min(width, window.innerWidth - MARGIN * 2);
        setShownWidth(w);
        // Centre on the icon and clamp horizontally; the vertical fit needs the card's
        // real height, so park it below for one paint and correct it in the layout effect.
        const left = Math.max(MARGIN, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - MARGIN));
        setPos({ top: r.bottom + 8, left, measured: false });
    };
    const close = () => setPos(null);

    // Now that the card has a height: keep it below the icon if it fits, otherwise put
    // it above, and clamp so it never runs past the top or bottom of the viewport.
    useLayoutEffect(() => {
        if (!pos || pos.measured) return;
        const card = cardRef.current?.getBoundingClientRect();
        const btn = btnRef.current?.getBoundingClientRect();
        if (!card || !btn) return;
        const limit = window.innerHeight - MARGIN;
        let top = btn.bottom + 8;
        if (top + card.height > limit) top = btn.top - 8 - card.height;      // flip above
        top = Math.max(MARGIN, Math.min(top, limit - card.height));          // clamp
        setPos(p => (p ? { ...p, top, measured: true } : p));
    }, [pos]);

    // The card is position:fixed, so it would drift away from its icon if the page or
    // the modal body scrolled underneath it.
    useEffect(() => {
        if (!pos) return;
        window.addEventListener('scroll', close, true); // capture → catches inner scrollers too
        window.addEventListener('resize', close);
        return () => {
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
        };
    }, [pos]);

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                className={`help-tip-btn ${pos ? 'active' : ''}`}
                aria-label={label}
                title={label}
                onMouseEnter={open}
                onMouseLeave={close}
                onFocus={open}
                onBlur={close}
                onClick={() => (pos ? close() : open())} // tap target for touch devices
            >
                <HelpCircle size={14} />
            </button>

            {pos && createPortal(
                <div
                    ref={cardRef}
                    className="help-tip-card"
                    style={{ top: pos.top, left: pos.left, width: shownWidth, visibility: pos.measured ? 'visible' : 'hidden' }}
                    role="tooltip"
                >
                    {children}
                </div>,
                document.body
            )}
        </>
    );
}
