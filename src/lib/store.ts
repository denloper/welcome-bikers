import type { Booking, ChatMessage, Review, User } from "../types";

const KEY = "wb.v2";
const PASSWORD_ITERATIONS = 120_000;

type StoredUser = User & {
  password?: string;
  passwordHash?: string;
  passwordSalt?: string;
};

type State = {
  user: User | null;
  users: StoredUser[];
  favorites: string[];
  messages: ChatMessage[];
  reviews: Review[];
  bookings: Booking[];
  pendingPlaces: unknown[];
};

const empty: State = {
  user: null,
  users: [],
  favorites: [],
  messages: [
    {
      id: "m1",
      room: "general",
      userId: "sys",
      name: "WelcomeBikers",
      text: "Welcome to the riders chat. Share roads, meetups and tips.",
      createdAt: Date.now() - 86400000,
    },
  ],
  reviews: [],
  bookings: [],
  pendingPlaces: [],
};

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty;
    return { ...empty, ...JSON.parse(raw) };
  } catch {
    return empty;
  }
}

function save(state: State) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function passwordHash(password: string, salt: Uint8Array): Promise<string> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new Uint8Array(salt),
      iterations: PASSWORD_ITERATIONS,
    },
    material,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

async function createCredential(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    passwordHash: await passwordHash(password, salt),
    passwordSalt: bytesToBase64(salt),
  };
}

function publicUser(user: StoredUser): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    emailVerified: user.emailVerified,
    friends: user.friends ?? [],
  };
}

export const store = {
  get: load,
  setUser(user: User | null) {
    const s = load();
    s.user = user;
    if (user) {
      const i = s.users.findIndex((u) => u.id === user.id);
      if (i >= 0) s.users[i] = { ...s.users[i], ...user };
      else s.users.push(user);
    }
    save(s);
    return s;
  },
  async register(name: string, email: string, password: string): Promise<User> {
    const s = load();
    const normalizedEmail = email.trim().toLowerCase();
    if (password.length < 8) throw new Error("Password must be at least 8 characters");
    if (s.users.some((u) => u.email.toLowerCase() === normalizedEmail)) throw new Error("Email already used");
    const user: User = {
      id: crypto.randomUUID(),
      name,
      email: normalizedEmail,
      emailVerified: false,
      friends: [],
    };
    const credential = await createCredential(password);
    s.users.push({ ...user, ...credential });
    s.user = user;
    save(s);
    return user;
  },
  async login(email: string, password: string): Promise<User> {
    const s = load();
    const normalizedEmail = email.trim().toLowerCase();
    const found = s.users.find((u) => u.email.toLowerCase() === normalizedEmail);
    if (!found) {
      throw new Error("Wrong email or password");
    }
    let valid = false;
    if (found.passwordHash && found.passwordSalt) {
      const candidate = await passwordHash(password, base64ToBytes(found.passwordSalt));
      valid = candidate === found.passwordHash;
    } else if (typeof found.password === "string") {
      valid = found.password === password;
      if (valid) {
        const credential = await createCredential(password);
        Object.assign(found, credential);
        delete found.password;
      }
    }
    if (!valid) throw new Error("Wrong email or password");
    const user = publicUser(found);
    s.user = user;
    save(s);
    return user;
  },
  toggleFavorite(id: string) {
    const s = load();
    s.favorites = s.favorites.includes(id)
      ? s.favorites.filter((x) => x !== id)
      : [...s.favorites, id];
    save(s);
    return s.favorites;
  },
  addMessage(msg: ChatMessage) {
    const s = load();
    s.messages.push(msg);
    save(s);
    return s.messages;
  },
  addReview(review: Review) {
    const s = load();
    s.reviews.push(review);
    save(s);
    return s.reviews;
  },
  addBooking(booking: Booking) {
    const s = load();
    s.bookings.unshift(booking);
    save(s);
    return s.bookings;
  },
  addPending(place: unknown) {
    const s = load();
    s.pendingPlaces.unshift(place);
    save(s);
    return s.pendingPlaces;
  },
};
