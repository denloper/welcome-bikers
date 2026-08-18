import type { Booking, ChatMessage, Review, User } from "../types";

const KEY = "wb.v2";

type State = {
  user: User | null;
  users: Array<User & { password?: string }>;
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

export const store = {
  get: load,
  setUser(user: User | null) {
    const s = load();
    s.user = user;
    if (user) {
      const i = s.users.findIndex((u) => u.id === user.id);
      if (i >= 0) s.users[i] = user;
      else s.users.push(user);
    }
    save(s);
    return s;
  },
  register(name: string, email: string, password: string): User {
    const s = load();
    if (s.users.some((u) => u.email === email)) throw new Error("Email already used");
    const user: User = {
      id: crypto.randomUUID(),
      name,
      email,
      emailVerified: false,
      friends: [],
    };
    s.users.push({ ...user, password });
    s.user = user;
    save(s);
    return user;
  },
  login(email: string, password: string): User {
    const s = load();
    const found = s.users.find((u) => u.email === email) as (User & { password?: string }) | undefined;
    if (!found || (found.password && found.password !== password)) {
      throw new Error("Wrong email or password");
    }
    const user: User = {
      id: found.id,
      name: found.name,
      email: found.email,
      avatar: found.avatar,
      emailVerified: found.emailVerified,
      friends: found.friends ?? [],
    };
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
