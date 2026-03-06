// src/App.jsx
import React, { useState, useEffect } from "react";

// Login prompt component
const LoginPrompt = ({ onLoginClick }) => (
  <div style={{
    position: 'fixed',
    bottom: window.innerWidth < 768 ? '88px' : '16px',
    right: '16px',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    color: '#333',
    padding: '8px 16px',
    borderRadius: '8px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    zIndex: 1000,
    border: '1px solid #e5e7eb',
    fontSize: '14px',
  }}>
    <span>✨ Save your todos across devices - </span>
    <button
      onClick={onLoginClick}
      style={{
        color: '#3b82f6',
        fontWeight: 500,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '2px 0',
      }}
    >
      Sign up or log in
    </button>
  </div>
);

export default function App() {
  // Lists state: array of { id, name, todos: [...] }
  // Todos now come from backend only; start empty
  const [lists, setLists] = useState([]);
  const [currentListId, setCurrentListId] = useState(null);

  const [input, setInput] = useState("");

  // (List renaming is now handled inline — no extra state needed)

  // List deletion animation state
  const [deletingListIds, setDeletingListIds] = useState([]);

  // Track which list is being hovered
  const [hoveredListId, setHoveredListId] = useState(null);

  // Resizable sidebar state
  const [sidebarWidth, setSidebarWidth] = useState(25); // percentage (1/4th of page)
  const [isResizing, setIsResizing] = useState(false);

  // Mobile menu state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);

  // Drag and drop state
  const [draggedListId, setDraggedListId] = useState(null);
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [newListIds, setNewListIds] = useState([]);

  // --- Authentication state ---
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login"); // "login" or "register"
  const [authUser, setAuthUser] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  // UI: show auth modal
  const [showAuthModal, setShowAuthModal] = useState(false);

  // API helper that always uses credentials and JSON
  const API_BASE = import.meta.env.VITE_API_URL || '';
  async function apiFetch(path, opts = {}) {
    const headers = opts.headers || {};
    const hasBody = opts.body !== undefined;
    if (hasBody) {
      headers["Content-Type"] = "application/json";
    }
    const res = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      ...opts,
      headers,
      body: hasBody && typeof opts.body !== "string" ? JSON.stringify(opts.body) : opts.body,
    });
    let data = null;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch (e) {
      data = text;
    }
    if (!res.ok) {
      const message = (data && data.error) || res.statusText || "Request failed";
      const err = new Error(message);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  }

  // Local storage operations
  const loadLocalLists = () => {
    try {
      // Try new multi-list format first
      const savedLists = localStorage.getItem('guestLists');
      if (savedLists) {
        const parsed = JSON.parse(savedLists);
        setLists(parsed);
        // Set current list to first one if available, or null
        if (parsed.length > 0) {
          setCurrentListId(parsed[0].id);
        } else {
          setCurrentListId(null);
        }
        return true;
      }

      // Fallback: Check for legacy single-list format (migration)
      const savedTodos = localStorage.getItem('guestTodos');
      if (savedTodos) {
        const todos = JSON.parse(savedTodos);
        const migratedList = { id: 'local', name: 'My Todos', todos };
        const newLists = [migratedList];

        setLists(newLists);
        setCurrentListId('local');

        // Save in new format and clean up old
        saveLocalLists(newLists);
        localStorage.removeItem('guestTodos');
        return true;
      }

      // No data found
      setLists([]);
      setCurrentListId(null);
      return false;
    } catch (err) {
      console.error('Failed to load local lists', err);
      setLists([]);
      setCurrentListId(null);
      return false;
    }
  };

  const saveLocalLists = (lists) => {
    try {
      localStorage.setItem('guestLists', JSON.stringify(lists));
    } catch (err) {
      console.error('Failed to save lists locally', err);
    }
  };

  // On mount, check session and load data
  async function loadFromServer() {
    try {
      const serverLists = await apiFetch('/api/lists');
      // Map server lists to frontend format (use server IDs directly)
      const mapped = serverLists.map((sl) => ({
        id: sl.id,          // server integer ID
        name: sl.name,
        todos: sl.todos || [],
      }));
      setLists(mapped);
      if (mapped.length > 0) {
        setCurrentListId(mapped[0].id);
      } else {
        setCurrentListId(null);
      }
    } catch (err) {
      console.error('Failed to load lists from server', err);
    }
  }

  async function initApp() {
    // Try to restore session first
    try {
      const data = await apiFetch('/api/auth/me');
      if (data && data.user) {
        setUser(data.user);
        await loadFromServer();
        return;
      }
    } catch (err) {
      // Not logged in — fall through to local storage
    }
    // Guest mode: load from localStorage
    loadLocalLists();
  }

  useEffect(() => {
    initApp();
  }, []);

  // Auth submit (login or register)
  const submitAuth = async (e, creds) => {
    if (e && e.preventDefault) e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    try {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = creds ? { username: creds.username, password: creds.password } : { username: authUser, password: authPass };
      const data = await apiFetch(endpoint, { method: 'POST', body });
      if (data && data.user) {
        setUser(data.user);
        setAuthUser('');
        setAuthPass('');
        setAuthError(null);
        // Load lists from server after login
        await loadFromServer();
        return true;
      }
      return false;
    } catch (err) {
      setAuthError(err.message || 'Authentication failed');
      return false;
    } finally {
      setAuthLoading(false);
    }
  };

  // keep a ref to submitAuth so modal can call it without causing remounts/re-renders
  const submitAuthRef = React.useRef(submitAuth);
  React.useEffect(() => { submitAuthRef.current = submitAuth; }, [submitAuth]);

  const logout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.warn('Logout error', err);
    }
    setUser(null);
    setLists([]);
    setCurrentListId(null);
  };

  // Handle sidebar resize
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      const newWidth = (e.clientX / window.innerWidth) * 100;
      // Constrain width between 15% and 50%
      if (newWidth >= 15 && newWidth <= 50) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isResizing]);

  // Handle window resize for mobile detection
  useEffect(() => {
    const handleWindowResize = () => {
      setIsMobileView(window.innerWidth < 768);
    };

    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, []);

  // helper id generator
  const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  // animation helper lists (store ids)
  const [addingIds, setAddingIds] = useState([]);    // ids that are "just added"
  const [removingIds, setRemovingIds] = useState([]); // ids that are being removed (animating)

  // Get current list
  const currentList = lists.find((l) => l.id === currentListId);
  const todos = currentList?.todos || [];

  // add a new todo (with small entrance animation)
  // Core add by text function used by local controls
  const addTodoText = async (text) => {
    const trimmed = (text || '').trim();
    if (!trimmed) return null;

    // If not logged in, use local storage
    if (!user) {
      const newTodo = {
        id: `local-${Date.now()}`,
        text: trimmed,
        done: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      setLists(prev => {
        if (prev.length === 0) {
          const newList = { id: 'local', name: 'List 1', todos: [newTodo] };
          saveLocalLists([newList]);
          setCurrentListId('local');
          return [newList];
        }
        const targetListId = currentListId || prev[0].id;
        const updatedLists = prev.map(list =>
          list.id === targetListId
            ? { ...list, todos: [newTodo, ...list.todos] }
            : list
        );
        saveLocalLists(updatedLists);
        return updatedLists;
      });
      return newTodo;
    }

    // Logged-in mode: optimistic update then sync
    try {
      let targetListId = currentListId;

      // If no lists exist, auto-create one on the server (must wait for this)
      if (lists.length === 0 || !targetListId) {
        const listCount = lists.filter(l => /^List \d+$/.test(l.name)).length + 1;
        const newList = await apiFetch('/api/lists', { method: 'POST', body: { name: `List ${listCount}` } });
        setLists(prev => [...prev, { id: newList.id, name: newList.name, todos: [] }]);
        targetListId = newList.id;
        setCurrentListId(newList.id);
      }

      // Optimistic: add a temp todo to UI immediately
      const tempId = `temp-${Date.now()}`;
      const tempTodo = { id: tempId, text: trimmed, done: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      setLists((prev) =>
        prev.map((l) => (l.id === targetListId ? { ...l, todos: [tempTodo, ...l.todos] } : l))
      );
      setAddingIds((prev) => [tempId, ...prev]);
      setTimeout(() => setAddingIds((prev) => prev.filter((x) => x !== tempId)), 50);

      // Sync to server in background, then replace temp with real
      apiFetch(`/api/lists/${targetListId}/todos`, { method: 'POST', body: { text: trimmed } })
        .then((created) => {
          setLists((prev) =>
            prev.map((l) => l.id === targetListId
              ? { ...l, todos: l.todos.map((t) => t.id === tempId ? created : t) }
              : l
            )
          );
        })
        .catch((err) => {
          // Revert on failure
          setLists((prev) =>
            prev.map((l) => l.id === targetListId
              ? { ...l, todos: l.todos.filter((t) => t.id !== tempId) }
              : l
            )
          );
          console.error('Add todo failed', err);
        });

      return tempTodo;
    } catch (err) {
      if (err && err.status === 401) setAuthError('Please login to add todos');
      else console.error('Add todo failed', err);
      throw err;
    }
  };

  // backward-compatible: keep previous signature for direct form use if needed
  const addTodo = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    try {
      await addTodoText(input);
      setInput('');
    } catch (err) {
      // errors handled above
    }
  };

  // soft-delete with animation
  const deleteTodo = async (id) => {
    setRemovingIds((prev) => [...prev, id]);

    // If not logged in, update local storage
    if (!user) {
      setLists(prev => {
        const updatedLists = prev.map(list =>
          list.id === currentListId
            ? { ...list, todos: list.todos.filter((t) => t.id !== id) }
            : list
        );
        saveLocalLists(updatedLists);
        return updatedLists;
      });
      setRemovingIds((prev) => prev.filter((x) => x !== id));
      return;
    }

    // Logged-in: optimistic delete then sync
    const prevLists = lists;
    setLists((prev) =>
      prev.map((list) =>
        list.id === currentListId
          ? { ...list, todos: list.todos.filter((t) => t.id !== id) }
          : list
      )
    );
    setRemovingIds((prev) => prev.filter((x) => x !== id));

    // Sync in background
    apiFetch(`/api/todos/${id}`, { method: 'DELETE' })
      .catch((err) => {
        // Revert on failure
        setLists(prevLists);
        console.error('Delete todo failed', err);
      });
  };

  // toggle done
  const toggleDone = async (id) => {
    const t = todos.find((x) => x.id === id);
    if (!t) return;

    // If not logged in, update local storage
    if (!user) {
      setLists(prev => {
        const updatedLists = prev.map(list =>
          list.id === currentListId
            ? {
              ...list,
              todos: list.todos.map(todo =>
                todo.id === id
                  ? { ...todo, done: !todo.done, updatedAt: new Date().toISOString() }
                  : todo
              )
            }
            : list
        );
        saveLocalLists(updatedLists);
        return updatedLists;
      });
      return;
    }

    // Logged-in: optimistic toggle then sync
    const prevLists = lists;
    setLists((prev) =>
      prev.map((l) =>
        l.id === currentListId
          ? { ...l, todos: l.todos.map((it) => it.id === id ? { ...it, done: !it.done, updatedAt: new Date().toISOString() } : it) }
          : l
      )
    );

    // Sync in background
    apiFetch(`/api/todos/${id}`, { method: 'PUT', body: { done: !t.done } })
      .catch((err) => {
        // Revert on failure
        setLists(prevLists);
        console.error('Toggle todo failed', err);
      });
  };



  // === LIST MANAGEMENT FUNCTIONS ===

  // Create a new list
  const createList = async () => {
    const listCount = lists.filter(list => /^List \d+$/.test(list.name)).length + 1;
    const listName = `List ${listCount}`;

    if (!user) {
      // Guest mode: local only
      const newListId = makeId();
      setLists(prev => {
        const newList = { id: newListId, name: listName, todos: [] };
        const updatedLists = [...prev, newList];
        saveLocalLists(updatedLists);
        return updatedLists;
      });
      setCurrentListId(newListId);
    } else {
      // Logged-in: create on server
      try {
        const newList = await apiFetch('/api/lists', { method: 'POST', body: { name: listName } });
        setLists(prev => [...prev, { id: newList.id, name: newList.name, todos: newList.todos || [] }]);
        setCurrentListId(newList.id);
      } catch (err) {
        console.error('Create list failed', err);
      }
    }
  };

  // Memoized New List button to avoid re-renders stealing focus
  const NewListButton = React.useMemo(() => React.memo(function NewListButtonInner({ onClick }) {
    const [isHovered, setIsHovered] = React.useState(false);

    return (
      <button
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          padding: "8px 12px",
          borderRadius: 6,
          border: "1px solid transparent",
          background: "transparent",
          color: "#ffffff",
          fontSize: 14,
          cursor: "pointer",
          fontWeight: 500,
          transition: "all 200ms cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow: isHovered ? "0 0 12px rgba(255, 255, 255, 0.15)" : "none",
        }}
      >
        + New List
      </button>
    );
  }), []);

  // Rename a list via explicit action button instead of inline click-to-edit
  const renameList = async (listId, newName) => {
    const trimmed = (newName || '').trim();
    if (!trimmed) return;
    setLists((prev) => {
      const updated = prev.map((list) =>
        list.id === listId ? { ...list, name: trimmed } : list
      );
      if (!user) saveLocalLists(updated);
      return updated;
    });

    if (user) {
      try {
        await apiFetch(`/api/lists/${listId}`, { method: 'PUT', body: { name: trimmed } });
      } catch (err) {
        console.error('Rename list failed', err);
      }
    }
  };

  const handleRenameList = async (list) => {
    const nextName = window.prompt('Rename list', list.name);
    if (nextName === null || nextName.trim() === '' || nextName.trim() === list.name) {
      return;
    }
    await renameList(list.id, nextName);
  };

  // Rename a task (works in both guest and logged-in modes)
  const renameTask = async (taskId, newText) => {
    const trimmed = (newText || '').trim();
    if (!trimmed) return;

    if (!user) {
      setLists((prev) => {
        const updated = prev.map((list) =>
          list.id === currentListId
            ? { ...list, todos: list.todos.map((t) => t.id === taskId ? { ...t, text: trimmed, updatedAt: new Date().toISOString() } : t) }
            : list
        );
        saveLocalLists(updated);
        return updated;
      });
      return;
    }

    try {
      const updated = await apiFetch(`/api/todos/${taskId}`, { method: 'PUT', body: { text: trimmed } });
      setLists((prev) =>
        prev.map((l) =>
          l.id === currentListId
            ? { ...l, todos: l.todos.map((t) => (t.id === taskId ? updated : t)) }
            : l
        )
      );
    } catch (err) {
      if (err.status === 401) setAuthError('Please login to rename tasks');
      else console.error('Rename task failed', err);
    }
  };

  // Delete a list
  const deleteList = async (listId) => {
    setDeletingListIds((prev) => [...prev, listId]);

    // Fire-and-forget server delete (UI already animating)
    if (user) {
      apiFetch(`/api/lists/${listId}`, { method: 'DELETE' })
        .catch((err) => console.error('Delete list failed', err));
    }

    setTimeout(() => {
      const filtered = lists.filter((l) => l.id !== listId);
      setLists(filtered);
      if (!user) saveLocalLists(filtered);

      if (filtered.length === 0) {
        setCurrentListId(null);
      } else if (currentListId === listId) {
        setCurrentListId(filtered[0].id);
      }
      setDeletingListIds((prev) => prev.filter((x) => x !== listId));
    }, 200);
  };

  // Reorder lists (drag and drop)
  const reorderLists = async (draggedId, targetId) => {
    const draggedIndex = lists.findIndex((l) => l.id === draggedId);
    const targetIndex = lists.findIndex((l) => l.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1) return;

    const newLists = [...lists];
    const [draggedList] = newLists.splice(draggedIndex, 1);
    newLists.splice(targetIndex, 0, draggedList);
    setLists(newLists);
    if (!user) {
      saveLocalLists(newLists);
    } else {
      try {
        await apiFetch('/api/lists/reorder', { method: 'PUT', body: { order: newLists.map(l => l.id) } });
      } catch (err) {
        console.error('Reorder lists failed', err);
      }
    }
  };

  // Reorder tasks within current list (drag and drop)
  const reorderTasks = async (draggedId, targetId) => {
    const draggedIndex = todos.findIndex((t) => t.id === draggedId);
    const targetIndex = todos.findIndex((t) => t.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1) return;

    const newTodos = [...todos];
    const [draggedTask] = newTodos.splice(draggedIndex, 1);
    newTodos.splice(targetIndex, 0, draggedTask);

    setLists((prev) => {
      const updatedLists = prev.map((l) =>
        l.id === currentListId ? { ...l, todos: newTodos } : l
      );
      if (!user) saveLocalLists(updatedLists);
      return updatedLists;
    });

    if (user) {
      try {
        await apiFetch(`/api/lists/${currentListId}/todos/reorder`, { method: 'PUT', body: { order: newTodos.map(t => t.id) } });
      } catch (err) {
        console.error('Reorder tasks failed', err);
      }
    }
  };

  // small layout colors (kept in JS for parity with previous file)
  const bg = "#1f1f1f";
  const text = "#ffffff";
  // Local Add Todo control (memoized) - keeps its own input state so typing doesn't trigger parent re-renders
  const AddTodoControl = React.memo(function AddTodoControlInner({ addTodoText, currentListId }) {
    const [localTask, setLocalTask] = React.useState('');
    const inputRef = React.useRef(null);

    // Auto-focus when currentListId changes (desktop only — avoids mobile keyboard popup)
    React.useEffect(() => {
      if (inputRef.current && window.innerWidth >= 768) {
        inputRef.current.focus();
      }
    }, [currentListId]);

    const onSubmitLocal = async (e) => {
      e && e.preventDefault();
      const t = localTask.trim();
      if (!t) return;
      try {
        await addTodoText(t);
        setLocalTask('');
        // keep focus in input after submit (desktop only)
        if (window.innerWidth >= 768) {
          inputRef.current && inputRef.current.focus();
        } else {
          inputRef.current && inputRef.current.blur();
        }
      } catch (err) {
        // nothing extra here; parent handles auth errors
      }
    };

    return (
      <form onSubmit={onSubmitLocal} className="input-row" style={{ marginBottom: 16 }}>
        <input
          ref={inputRef}
          className="app-input"
          value={localTask}
          onChange={(e) => setLocalTask(e.target.value)}
          placeholder="Add a new task..."
          aria-label="New task"
        />
        <button className="app-button" type="submit">Add</button>
      </form>
    );
  });

  // -----------------------
  // Auth Modal component
  // -----------------------
  const AuthModalInner = function AuthModal({ onClose, visible: propVisible, authMode: parentAuthMode, setAuthMode: parentSetAuthMode }) {
    // TEMP: small helpers here; keep inside file for surgical change
    const modalRef = React.useRef(null);
    const userInputRef = React.useRef(null);
    const [visible, setVisible] = React.useState(false);
    // local form state to avoid updating parent on every keystroke
    const [localUser, setLocalUser] = React.useState('');
    const [localPass, setLocalPass] = React.useState('');
    const [localError, setLocalError] = React.useState(null);

    // focus and visibility effect: run when propVisible changes
    useEffect(() => {
      let prev = document.activeElement;
      const onKey = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          handleClose();
          return;
        }
        if (e.key === 'Tab') {
          // simple focus trap
          const focusable = modalRef.current && modalRef.current.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])');
          if (!focusable || focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey) {
            if (document.activeElement === first) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      };

      if (propVisible) {
        // open
        setVisible(false);
        setTimeout(() => setVisible(true), 10);
        // autofocus only when modal becomes visible
        setTimeout(() => {
          userInputRef.current && userInputRef.current.focus();
        }, 60);
        document.addEventListener('keydown', onKey);
      } else {
        // close
        setVisible(false);
      }

      return () => {
        document.removeEventListener('keydown', onKey);
        prev && prev.focus && prev.focus();
      };
    }, [propVisible]);

    const handleClose = () => {
      setVisible(false);
      setTimeout(() => onClose && onClose(), 180);
    };

    const onSubmit = async (e) => {
      e && e.preventDefault();
      setLocalError(null);
      try {
        // call parent's submit via ref so modal doesn't depend on parent render identity
        const ok = await submitAuthRef.current(null, { username: localUser, password: localPass });
        if (ok) {
          handleClose();
        }
      } catch (err) {
        setLocalError(err && err.message ? err.message : 'Authentication failed');
      }
    };

    return (
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2000,
          display: (propVisible || visible) ? 'flex' : 'none',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) handleClose();
        }}
      >
        {/* Backdrop */}
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', transition: 'opacity 180ms ease' }} />

        {/* Card */}
        <div
          ref={modalRef}
          style={{
            position: 'relative',
            minWidth: 300,
            width: 'min(420px, 92%)',
            borderRadius: 14,
            padding: 20,
            background: '#272727',
            boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
            border: '1px solid rgba(255,255,255,0.04)',
            transform: visible ? 'scale(1)' : 'scale(0.96)',
            opacity: visible ? 1 : 0,
            transition: 'all 160ms cubic-bezier(0.2,0,0,1)',
            color: '#fff',
            zIndex: 2001,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <button
            onClick={handleClose}
            aria-label="Close"
            style={{ position: 'absolute', right: 8, top: 8, background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 16 }}
          >
            ✕
          </button>

          <h3 style={{ margin: 0, fontSize: 18, color: '#fff' }}>{parentAuthMode === 'login' ? 'Login' : 'Register'}</h3>

          {(localError || authError) && (
            <div style={{ color: '#ff6b6b', fontSize: 13 }}>{localError || authError}</div>
          )}

          <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              ref={userInputRef}
              aria-label="Username"
              value={localUser}
              onChange={(e) => setLocalUser(e.target.value)}
              placeholder="Username"
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #333', background: '#222', color: '#fff' }}
            />
            <input
              aria-label="Password"
              type="password"
              value={localPass}
              onChange={(e) => setLocalPass(e.target.value)}
              placeholder="Password"
              onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #333', background: '#222', color: '#fff' }}
            />

            <button
              type="submit"
              disabled={authLoading}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: '#ffffff',
                border: '1px solid rgba(0,0,0,0.08)',
                color: '#111111',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                minHeight: 42,
              }}
            >
              {authLoading ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block' }}>
                    <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(17,17,17,0.2)" strokeWidth="3" />
                    <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="#111111" strokeWidth="3" strokeLinecap="round">
                      <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
                    </path>
                  </svg>
                  <span>{parentAuthMode === 'login' ? 'Logging in...' : 'Creating account...'}</span>
                </>
              ) : (parentAuthMode === 'login' ? 'Login' : 'Register')}
            </button>
          </form>

          <div style={{ fontSize: 13, color: '#9a9a9a' }}>
            {parentAuthMode === 'login' ? (
              <span>New here? <button onClick={() => parentSetAuthMode('register')} style={{ background: 'transparent', border: 'none', color: '#ffffff', textDecoration: 'underline', cursor: 'pointer' }}>Register</button></span>
            ) : (
              <span>Already have an account? <button onClick={() => parentSetAuthMode('login')} style={{ background: 'transparent', border: 'none', color: '#ffffff', textDecoration: 'underline', cursor: 'pointer' }}>Login</button></span>
            )}
          </div>
        </div>
      </div>
    );
  }
  const AuthModal = React.memo(AuthModalInner);

  return (
    <div
      style={{
        background: bg,
        minHeight: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      {/* Top Header with Flow Logo and Auth */}
      <div
        style={{
          padding: "20px 24px",
          borderBottom: "1px solid #3a3a3a",
          background: bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          zIndex: 100,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, color: text }}>Flow</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {!user ? (
            // Profile icon button opens modal
            <button
              onClick={() => setShowAuthModal(true)}
              aria-label="Open authentication"
              title="Sign in"
              style={{
                width: 36,
                height: 36,
                borderRadius: 36,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#272727',
                border: '1px solid #333',
                color: '#fff',
                cursor: 'pointer',
                fontSize: 16,
              }}
            >
              👤
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: '#9a9a9a' }}>Hello, <strong style={{ color: '#fff' }}>{user.username}</strong></span>
              <button onClick={logout} style={{ padding: '6px 10px', borderRadius: 6, background: '#272727', border: '1px solid #444', color: '#fff', cursor: 'pointer' }}>Logout</button>
            </div>
          )}
        </div>
      </div>
      {/* Auth modal root - always mounted to avoid remount on parent rerenders */}
      <AuthModal
        visible={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        authMode={authMode}
        setAuthMode={setAuthMode}
      />

      {/* Main Content Area */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          flex: 1,
        }}
      >
        {/* Mobile Hamburger Menu */}
        {isMobileView && (
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            style={{
              position: "fixed",
              bottom: 24,
              right: 24,
              zIndex: 1000,
              width: 52,
              height: 52,
              padding: 0,
              border: "none",
              background: "#272727",
              color: "#ffffff",
              fontSize: 20,
              cursor: "pointer",
              borderRadius: "50%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
            }}
            title="Toggle menu"
          >
            <div style={{ width: 18, height: 2, background: "#ffffff", borderRadius: 1 }}></div>
            <div style={{ width: 18, height: 2, background: "#ffffff", borderRadius: 1 }}></div>
            <div style={{ width: 18, height: 2, background: "#ffffff", borderRadius: 1 }}></div>
          </button>
        )}

        {/* Mobile Side Menu Overlay */}
        {isMobileView && isMobileMenuOpen && (
          <div
            onClick={() => setIsMobileMenuOpen(false)}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.5)",
              zIndex: 999,
            }}
          />
        )}

        {/* Sidebar - hidden on mobile unless menu is open */}
        <div
          style={{
            width: isMobileView ? "70%" : `${sidebarWidth}%`,
            minWidth: isMobileView ? "70%" : `${sidebarWidth}%`,
            borderRight: "1px solid #3a3a3a",
            padding: 24,
            overflowY: "auto",
            color: text,
            display: isMobileView && !isMobileMenuOpen ? "none" : "flex",
            flexDirection: "column",
            gap: 12,
            position: isMobileView ? "fixed" : "relative",
            left: 0,
            top: isMobileView ? 0 : "auto",
            height: isMobileView ? "100vh" : "auto",
            background: bg,
            zIndex: isMobileView && isMobileMenuOpen ? 1001 : "auto",
            transform: isMobileView && !isMobileMenuOpen ? "translateX(-100%)" : "translateX(0)",
            transition: "transform 300ms ease",
          }}
        >
          {/* Resize handle */}
          <div
            onMouseDown={() => setIsResizing(true)}
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              width: "4px",
              height: "100%",
              cursor: "col-resize",
              background: isResizing ? "#4ade80" : "transparent",
              transition: "background 120ms ease",
              userSelect: "none",
              display: isMobileView ? "none" : "block",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(74, 222, 128, 0.3)";
            }}
            onMouseLeave={(e) => {
              if (!isResizing) {
                e.currentTarget.style.background = "transparent";
              }
            }}
          />
          {NewListButton ? <NewListButton onClick={createList} /> : (
            <button
              onClick={createList}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "2px solid transparent",
                background: "transparent",
                color: "#ffffff",
                fontSize: 14,
                cursor: "pointer",
                fontWeight: 500,
                transition: "all 200ms cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            >
              + New List
            </button>
          )}

          {/* List tabs */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {lists.map((list) => (
              <div
                key={list.id}
                className={[
                  "list-item-row",
                  deletingListIds.includes(list.id) ? "list-item-deleting" : "",
                  newListIds.includes(list.id) ? "list-item-adding" : ""
                ].filter(Boolean).join(" ")}
                draggable
                onDragStart={() => setDraggedListId(list.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (draggedListId && draggedListId !== list.id) {
                    reorderLists(draggedListId, list.id);
                  }
                  setDraggedListId(null);
                }}
                onDragEnd={() => setDraggedListId(null)}
                onClick={() => setCurrentListId(list.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "2px 0",
                  borderRadius: 8,
                  opacity: draggedListId === list.id ? 0.5 : 1,
                  transition: "opacity 150ms ease, background-color 120ms ease",
                  cursor: "pointer",
                }}
              >
                <>
                  {/* Drag handle for lists */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      cursor: "grab",
                      color: "#9a9a9a",
                      transition: "color 120ms ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "#ffffff";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "#9a9a9a";
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
                      <circle cx="4" cy="5" r="1.5" />
                      <circle cx="4" cy="9" r="1.5" />
                      <circle cx="4" cy="13" r="1.5" />
                      <circle cx="10" cy="5" r="1.5" />
                      <circle cx="10" cy="9" r="1.5" />
                      <circle cx="10" cy="13" r="1.5" />
                    </svg>
                  </div>
                  <div
                    style={{
                      flex: 1,
                      padding: "8px 10px",
                      borderRadius: 6,
                      background: currentListId === list.id ? "#252525" : "transparent",
                      fontSize: 14,
                      fontWeight: currentListId === list.id ? 600 : 400,
                      fontFamily: "inherit",
                      color: "#fff",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      userSelect: "none",
                    }}
                    title={list.name}
                  >
                    {list.name}
                  </div>
                </>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRenameList(list);
                  }}
                  className="list-edit-btn"
                  style={{
                    padding: "6px 8px",
                    borderRadius: 4,
                    border: "none",
                    background: "transparent",
                    color: "#9a9a9a",
                    fontSize: 16,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  title="Rename list"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11.5 2.5a1.4 1.4 0 0 1 2 2L6 12l-3 .5.5-3 8-7z" />
                    <path d="M10.5 3.5l2 2" />
                  </svg>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteList(list.id);
                  }}
                  className="list-delete-btn"
                  style={{
                    padding: "6px 8px",
                    borderRadius: 4,
                    border: "none",
                    background: "transparent",
                    color: "#ff6b6b",
                    fontSize: 16,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  title="Delete list"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 4h12M6 4V2.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V4M3.5 4l.5 9.5a1 1 0 0 0 1 .5h6a1 1 0 0 0 1-.5L12.5 4M6 7v4M10 7v4" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

        </div>

        {/* Main content - the todo list */}
        <div
          style={{
            flex: 1,
            padding: isMobileView ? "24px 20px 24px 20px" : 24,
            paddingTop: 24,
            display: "flex",
            justifyContent: "flex-start",
            alignItems: "flex-start",
            color: text,
            width: isMobileView ? "100%" : "auto",
            overflowX: "auto",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "640px",
            }}
          >
            {currentList && (
              <h2 style={{ margin: "0 0 24px 0", color: "#ffffff", fontSize: 24, fontWeight: 600 }}>
                {currentList.name}
              </h2>
            )}
            <p style={{ margin: "0 0 20px 0", color: "#9a9a9a", display: currentList ? "none" : "block" }}>
              {lists.length === 0 ? "Add your first task to get started. A list will be created automatically." : "A clean, minimal to-do list — add tasks below."}
            </p>

            {/* AddTodoControl: local input state to avoid parent re-renders stealing focus */}
            <AddTodoControl addTodoText={addTodoText} currentListId={currentListId} />

            {lists.length > 0 && (
              <ul className="todo-list">
                {todos.length === 0 ? (
                  <li style={{ color: "#9a9a9a" }}>No todos yet — add one above.</li>
                ) : (
                  todos.map((t) => {
                    const isNew = addingIds.includes(t.id);
                    const isRemoving = removingIds.includes(t.id);

                    // choose classes based on state
                    const itemClass = [
                      "todo-item",
                      isNew ? "new" : "",
                      isRemoving ? "removing" : ""
                    ].filter(Boolean).join(" ");

                    return (
                      <li
                        key={t.id}
                        className={itemClass}
                        draggable
                        onDragStart={() => setDraggedTaskId(t.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (draggedTaskId && draggedTaskId !== t.id) {
                            reorderTasks(draggedTaskId, t.id);
                            setDraggedTaskId(null);
                          }
                        }}
                        onDragEnd={() => setDraggedTaskId(null)}
                        style={{
                          opacity: draggedTaskId === t.id ? 0.5 : 1
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", cursor: "grab", color: "#9a9a9a" }}>
                            <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
                              <circle cx="4" cy="5" r="1.5" />
                              <circle cx="4" cy="9" r="1.5" />
                              <circle cx="4" cy="13" r="1.5" />
                              <circle cx="10" cy="5" r="1.5" />
                              <circle cx="10" cy="9" r="1.5" />
                              <circle cx="10" cy="13" r="1.5" />
                            </svg>
                          </div>
                          <label style={{ display: "flex", alignItems: "center", gap: 0, cursor: "pointer" }}>
                            <input
                              className="todo-checkbox"
                              type="checkbox"
                              checked={t.done}
                              onChange={() => toggleDone(t.id)}
                            />
                          </label>
                        </div>
                        <div style={{ flex: 1 }}>
                          <input
                            ref={(el) => {
                              if (!el) return;
                              el._taskId = t.id;
                              el._origText = t.text;
                            }}
                            type="text"
                            defaultValue={t.text}
                            key={`task-text-${t.id}-${t.text}`}
                            className={`inline-edit-task todo-text ${t.done ? "done" : ""}`}
                            onFocus={(e) => {
                              const input = e.currentTarget;
                              const handleOutsideClick = (evt) => {
                                if (evt.target !== input) {
                                  const newText = input.value.trim();
                                  if (newText && newText !== input._origText) {
                                    renameTask(input._taskId, newText);
                                  } else {
                                    input.value = input._origText;
                                  }
                                  document.removeEventListener('mousedown', handleOutsideClick);
                                }
                              };
                              if (input._outsideClickHandler) {
                                document.removeEventListener('mousedown', input._outsideClickHandler);
                              }
                              input._outsideClickHandler = handleOutsideClick;
                              document.addEventListener('mousedown', handleOutsideClick);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const newText = e.currentTarget.value.trim();
                                if (newText && newText !== t.text) {
                                  renameTask(t.id, newText);
                                } else {
                                  e.currentTarget.value = t.text;
                                }
                                e.currentTarget.blur();
                                if (e.currentTarget._outsideClickHandler) {
                                  document.removeEventListener('mousedown', e.currentTarget._outsideClickHandler);
                                }
                              }
                              if (e.key === "Escape") {
                                e.currentTarget.value = t.text;
                                e.currentTarget.blur();
                                if (e.currentTarget._outsideClickHandler) {
                                  document.removeEventListener('mousedown', e.currentTarget._outsideClickHandler);
                                }
                              }
                            }}
                            style={{
                              width: "100%",
                              background: "transparent",
                              borderRadius: 6,
                              padding: "4px 8px",
                              color: t.done ? "#6b7280" : "#fff",
                              fontSize: "inherit",
                              fontFamily: "inherit",
                              cursor: "text",
                              outline: "none",
                              textDecoration: t.done ? "line-through" : "none",
                            }}
                          />

                        </div>

                        <button
                          onClick={() => deleteTodo(t.id)}
                          className="todo-delete"
                          aria-label={`Delete ${t.text}`}
                        >
                          ✕
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            )}
          </div>
        </div>
      </div>
      {!user && <LoginPrompt onLoginClick={() => setShowAuthModal(true)} />}
    </div>
  );
}
