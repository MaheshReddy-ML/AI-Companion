import { useContext } from "react";
import { AuthContext } from "../../context/AuthContext";

export default function ProfileModal({ onClose }) {
  const { user, setUser } = useContext(AuthContext);

  const logout = () => {
    setUser(null);
    window.location.href = "/login";
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl w-80 border border-gray-300 dark:border-gray-700 shadow-lg">
        <h2 className="text-lg font-semibold mb-4">Profile</h2>

        <p className="mb-2">
          <strong>Name:</strong> {user?.name}
        </p>
        <p className="mb-6">
          <strong>Email:</strong> {user?.email}
        </p>

        <div className="flex justify-between gap-2">
          <button onClick={onClose} className="flex-1 border border-gray-300 dark:border-gray-600 px-4 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
            Close
          </button>
          <button
            onClick={logout}
            className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
