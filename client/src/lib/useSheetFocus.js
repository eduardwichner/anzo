import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A sheet or dialog over the page (course, level, practice and report sheets, a message): focus
 * moves into it (`initialRef`, else its first control), Tab and Shift+Tab stay inside it, Escape calls `onClose` (when
 * given), and on closing the focus returns to what had it before (the button that opened the sheet).
 */
export function useSheetFocus(dialogRef, { initialRef = null, onClose = null } = {}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement;
    const dialog = dialogRef.current;
    const controls = () => [...(dialog?.querySelectorAll(FOCUSABLE) ?? [])].filter((el) => el.offsetParent !== null || el === document.activeElement);
    (initialRef?.current ?? controls()[0] ?? dialog)?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape' && onCloseRef.current) {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const list = controls();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      const inside = dialog.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      // back to the opener, if it is still on the page (a sheet that navigated away leaves it alone)
      if (opener && opener !== document.body && document.contains(opener)) opener.focus?.({ preventScroll: true });
    };
  }, [dialogRef, initialRef]);
}
