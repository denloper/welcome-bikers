import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { BottomNav } from "./components/BottomNav";
import { Main } from "./pages/Main";
import { CategoryList } from "./pages/CategoryList";
import { ObjectDetail } from "./pages/ObjectDetail";
import { HotelBook } from "./pages/HotelBook";
import { Reviews } from "./pages/Reviews";
import { ChatList, ChatRoom } from "./pages/ChatPage";
import { Account, AccountEdit, Bookings, Friends } from "./pages/Account";
import { Login, Register } from "./pages/Auth";
import { AddPlace } from "./pages/AddPlace";
import { Help } from "./pages/Help";
import { RouteDetail, Routes as RideRoutes } from "./pages/Routes";
import { Admin } from "./pages/Admin";

const MapPage = lazy(() => import("./pages/MapPage").then((module) => ({ default: module.MapPage })));

export default function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Main />} />
        <Route path="/objects/:category" element={<CategoryList />} />
        <Route path="/object/:id" element={<ObjectDetail />} />
        <Route path="/object/:id/book" element={<HotelBook />} />
        <Route path="/object/:id/reviews" element={<Reviews />} />
        <Route
          path="/map"
          element={
            <Suspense fallback={<div className="page-loading">Loading map…</div>}>
              <MapPage />
            </Suspense>
          }
        />
        <Route path="/chat" element={<ChatList />} />
        <Route path="/chat/:room" element={<ChatRoom />} />
        <Route path="/account" element={<Account />} />
        <Route path="/account/edit" element={<AccountEdit />} />
        <Route path="/account/friends" element={<Friends />} />
        <Route path="/account/bookings" element={<Bookings />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/add" element={<AddPlace />} />
        <Route path="/help" element={<Help />} />
        <Route path="/routes" element={<RideRoutes />} />
        <Route path="/routes/:id" element={<RouteDetail />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </div>
  );
}
