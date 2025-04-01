import { useEffect, useState } from "react";
import { db, storage } from "./firebase"; // Import Firebase setup
import {
  doc,
  deleteDoc,
  getDoc,
  increment,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  getFirestore,
  collection,
  getDocs,
  onSnapshot,
  updateDoc,
  limit,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  uploadBytesResumable,
  deleteObject,
} from "firebase/storage";
import { deleteUser } from "firebase/auth";
import "./App.css";
const API_USER = import.meta.env.VITE_API_USER;
const API_SECRET = import.meta.env.VITE_API_SECRET;

function App() {
  const [slot, setSlot] = useState("");
  const [image, setImage] = useState(null);
  const [message, setMessage] = useState("");
  const [slots, setSlots] = useState([]);
  const userId = "A1B2C3D4E5F6G7H8I9J0";
  // const userId = "A12345";
  const viewerId = "A12345";
  const updates = {
    name: "sumit sharma",
    bio: "This is my new bio",
    website: "https://sumitsharma.com",
    profile_image: image,
    username: "sumit_sharma",
  };

  // user related functions

  const createUser = async (userId, username, name, bio, website, file) => {
    if (!userId || !username || !name) {
      return { success: false, message: "Missing required fields." };
    }

    const userRef = doc(db, "users", userId);

    try {
      // Upload profile image (if provided)
      const imageUrl = file ? await uploadProfileImage(userId, file) : null;

      // User data to be stored in Firestore
      const userData = {
        username,
        name,
        bio: bio || "",
        website: website || "",
        cooldown: null,
        last_upload: null,
        total_views: 0,
        streaks: 0,
        total_likes: 0,
        profile_imageURL: imageUrl,
      };

      await setDoc(userRef, userData);
      return { success: true, message: "User created successfully!", userData };
    } catch (error) {
      console.error("❌ Error creating user:", error.message);
      return { success: false, message: error.message };
    }
  };

  const uploadProfileImage = async (userId, file) => {
    if (!file) return null;

    const filePath = `profile_pictures/${userId}`;
    const fileRef = ref(storage, filePath);

    try {
      const uploadTask = await uploadBytesResumable(fileRef, file);
      return await getDownloadURL(uploadTask.ref);
    } catch (error) {
      console.error("Error uploading profile image:", error.message);
      return null;
    }
  };

  // post related functions

  // const bookSlot = async (slot, userId) => {
  //   const slotRef = doc(db, "slots", slot);
  //   const userRef = doc(db, "users", userId);

  //   try {
  //     const result = await runTransaction(db, async (transaction) => {
  //       const userDoc = await transaction.get(userRef);
  //       if (!userDoc.exists()) {
  //         throw new Error("User does not exist.");
  //       }

  //       const userData = userDoc.data();

  //       const now = Date.now();
  //       const cooldownTime = userData.cooldown?.toMillis() || 0;

  //       if (now < cooldownTime) {
  //         throw new Error("You are on cooldown. Try again later.");
  //       }

  //       const slotData = (await transaction.get(slotRef)).data();

  //       if (slotData.status !== "available") {
  //         throw new Error("Slot is already booked.");
  //       }

  //       const expiresAt = Timestamp.fromDate(
  //         new Date(Date.now() + 5 * 60 * 1000)
  //       );

  //       transaction.update(slotRef, {
  //         booked_by: userRef,
  //         status: "processing",
  //         expires_at: expiresAt,
  //       });

  //       const newCooldown = new Date(now + 5 * 60 * 1000);
  //       transaction.update(userRef, {
  //         cooldown: newCooldown,
  //       });

  //       return { success: true, message: "Slot booked successfully!" };
  //     });

  //     return result;
  //   } catch (error) {
  //     console.log(error.message);
  //     return { success: false, message: error.message };
  //   }
  // };

  const bookSlot = async (slotId, userId) => {
    const slotRef = doc(db, "slots", slotId);
    const userRef = doc(db, "users", userId);

    try {
      const activeSlotQuery = query(
        collection(db, "slots"),
        where("booked_by", "==", userRef),
        where("expires_at", ">", Timestamp.now())
      );

      const activeSlotSnapshot = await getDocs(activeSlotQuery);

      if (!activeSlotSnapshot.empty) {
        throw new Error("🚫 Easy there! You can only claim one tile");
      }

      const result = await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) {
          throw new Error("User does not exist.");
        }

        const userData = userDoc.data();
        const now = Date.now();
        const cooldownTime = userData.cooldown?.toMillis() || 0;

        if (now < cooldownTime) {
          throw new Error("You are on cooldown. Try again later.");
        }

        const slotDoc = await transaction.get(slotRef);
        if (!slotDoc.exists() || slotDoc.data().status !== "available") {
          throw new Error("Slot is already booked.");
        }

        const expiresAt = Timestamp.fromDate(new Date(now + 5 * 60 * 1000));
        const newCooldown = Timestamp.fromDate(new Date(now + 5 * 60 * 1000));

        transaction.update(slotRef, {
          booked_by: userRef,
          status: "processing",
          expires_at: expiresAt,
        });

        transaction.update(userRef, {
          cooldown: newCooldown,
        });

        return { success: true, message: "Slot booked successfully!" };
      });

      return result;
    } catch (error) {
      console.log(error.message);
      return { success: false, message: error.message };
    }
  };

  const uploadImage = async (slot, userId, file) => {
    if (!file) {
      return { success: false, message: "No file selected for upload." };
    }

    try {
      const formData = new FormData();
      formData.append("media", file);
      formData.append("models", "nudity-2.1");
      formData.append("api_user", API_USER);
      formData.append("api_secret", API_SECRET);

      const response = await fetch(
        "https://api.sightengine.com/1.0/check.json",
        {
          method: "POST",
          body: formData,
        }
      );

      const moderationResult = await response.json();

      if (
        moderationResult.status !== "success" ||
        moderationResult.nudity.none < 0.5
      ) {
        return { success: false, message: "Image failed moderation." };
      }

      const slotRef = doc(db, "slots", slot);
      const userRef = doc(db, "users", userId);
      const filePath = `uploads/${slot}/${Date.now()}`;
      const fileRef = ref(storage, filePath);

      const uploadTask = await uploadBytesResumable(fileRef, file);
      const imageUrl = await getDownloadURL(uploadTask.ref);

      await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) throw new Error("User does not exist.");

        const userData = userDoc.data();
        const lastUploadTimestamp = userData.last_upload?.toMillis() || 0;
        const lastUploadDate = new Date(lastUploadTimestamp).toDateString();
        const todayDate = new Date().toDateString();
        const yesterdayDate = new Date(Date.now() - 86400000).toDateString();

        let newStreak = userData.streaks || 0;
        if (lastUploadDate !== todayDate) {
          newStreak = lastUploadDate === yesterdayDate ? newStreak + 1 : 1;
        }

        const expiresAt = Timestamp.fromDate(
          new Date(Date.now() + 20 * 60 * 1000)
        );
        const cooldownEnd = Timestamp.fromDate(
          new Date(Date.now() + 20 * 60 * 1000)
        );

        transaction.update(slotRef, {
          expires_at: expiresAt,
          imageURL: imageUrl,
          status: "booked",
          updated_at: serverTimestamp(),
        });

        transaction.update(userRef, {
          streaks: newStreak,
          last_upload: serverTimestamp(),
          cooldown: cooldownEnd,
        });
      });

      return {
        success: true,
        message: "Image uploaded, streak updated & cooldown applied",
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  };

  const resetSlot = async (slot) => {
    const slotRef = doc(db, "slots", slot);

    try {
      await runTransaction(db, async (transaction) => {
        transaction.update(slotRef, {
          booked_by: null,
          status: "available",
        });
      });

      console.log("Slot reset successfully.");
    } catch (error) {
      console.error("Error resetting slot:", error);
    }
  };

  const likeImage = async (slot, userId) => {
    const slotRef = doc(db, "slots", slot);
    const likeRef = doc(db, "slots", slot, "like_ids", userId);

    try {
      await runTransaction(db, async (transaction) => {
        const slotDoc = await transaction.get(slotRef, {
          fieldMask: ["booked_by"],
        });

        const bookedByRef = slotDoc.data().booked_by;

        if (!bookedByRef) {
          throw new Error("No user found for this slot.");
        }

        const likeDoc = await transaction.get(likeRef);
        if (likeDoc.exists()) {
          throw new Error("User has already liked this image.");
        }

        transaction.set(likeRef, {});

        transaction.update(slotRef, {
          likes: increment(1),
        });

        transaction.update(bookedByRef, {
          total_likes: increment(1),
        });
      });

      console.log("✅ Image liked successfully!");
      return { success: true, message: "Image liked successfully!" };
    } catch (error) {
      console.error("❌ Error liking image:", error.message);
      return { success: false, message: error.message };
    }
  };

  const unlikeImage = async (slot, userId) => {
    const slotRef = doc(db, "slots", slot);
    const likeRef = doc(db, "slots", slot, "like_ids", userId);

    try {
      await runTransaction(db, async (transaction) => {
        // Fetch only the `booked_by` field
        const slotDoc = await transaction.get(slotRef, {
          fieldMask: ["booked_by"],
        });

        const bookedByRef = slotDoc.data().booked_by; // Get only the `booked_by` reference

        if (!bookedByRef) {
          throw new Error("No user found for this slot.");
        }

        const likeDoc = await transaction.get(likeRef);
        if (!likeDoc.exists()) {
          throw new Error("User has not liked this image.");
        }

        // Remove the like document
        transaction.delete(likeRef);

        // Decrement likes count in slot document
        transaction.update(slotRef, {
          likes: increment(-1),
        });

        // Decrement total likes in the user document (owner of the image)
        transaction.update(bookedByRef, {
          total_likes: increment(-1),
        });
      });

      console.log("✅ Image unliked successfully!");
      return { success: true, message: "Image unliked successfully!" };
    } catch (error) {
      console.error("❌ Error unliking image:", error.message);
      return { success: false, message: error.message };
    }
  };

  const incrementUniqueViewCount = async (slot, userId) => {
    const slotRef = doc(db, "slots", slot);
    const viewerRef = doc(db, "slots", slot, "view_ids", userId);

    try {
      await runTransaction(db, async (transaction) => {
        const viewerDoc = await transaction.get(viewerRef);

        const slotDoc = await transaction.get(slotRef, {
          fieldMask: ["booked_by"],
        });

        const bookedByRef = slotDoc.data().booked_by;

        if (!bookedByRef) {
          throw new Error("No user found for this slot.");
        }

        if (!viewerDoc.exists()) {
          transaction.set(viewerRef, {});

          transaction.update(slotRef, {
            views: increment(1),
          });

          transaction.update(bookedByRef, {
            total_views: increment(1),
          });
        }
      });
    } catch (error) {
      console.error("Error updating view count:", error.message);
    }
  };

  const hasUserLikedSlot = async (slot, userId) => {
    try {
      const likeDocRef = doc(db, "slots", slot, "like_ids", userId);
      const likeDocSnap = await getDoc(likeDocRef);
      console.log(likeDocSnap.exists());
      return likeDocSnap.exists();
    } catch (error) {
      console.error("Error checking like status:", error);
      return false;
    }
  };

  // delete user and its data

  const deleteUserAccount = async (userId) => {
    const userRef = doc(db, "users", userId);

    try {
      // Step 1: Get user document
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        throw new Error("User does not exist.");
      }

      const userData = userDoc.data();
      const profileImageURL = userData.profile_imageURL;

      // Step 2: Delete profile image
      await deleteProfileImage(profileImageURL);

      // Step 3: Reset slots where user has posted
      await resetUserSlot(userId);

      // Step 4: Delete user document from Firestore
      await deleteDoc(userRef);
      console.log("User deleted from Firestore.");

      // Step 5: Delete user from Firebase Authentication
      const user = auth.currentUser;
      if (user && user.uid === userId) {
        await deleteUser(user);
        console.log("User deleted from Firebase Authentication.");
      } else {
        throw new Error(
          "Cannot delete user from authentication (user must be logged in)."
        );
      }

      return { success: true, message: "User deleted successfully!" };
    } catch (error) {
      console.error("Error deleting user:", error.message);
      return { success: false, message: error.message };
    }
  };

  const deleteProfileImage = async (imageURL) => {
    if (!imageURL) return;

    try {
      const fileRef = ref(storage, imageURL);
      await deleteObject(fileRef);
      console.log("Profile image deleted successfully.");
    } catch (error) {
      console.error("Error deleting profile image:", error.message);
    }
  };

  const resetUserSlot = async (userId) => {
    const slotsCollection = collection(db, "slots");
    const userRef = doc(db, "users", userId);

    try {
      const q = query(
        slotsCollection,
        where("booked_by", "==", userRef),
        limit(1)
      );
      const slotDocs = await getDocs(q);

      if (slotDocs.empty) {
        console.log("No active slot found for this user.");
        return;
      }

      const slotDoc = slotDocs.docs[0]; // Get the first (and only) slot
      const slotRef = slotDoc.ref;
      const slotData = slotDoc.data();

      // Delete image from Firebase Storage if exists
      if (slotData.imageURL) {
        const imageRef = ref(storage, slotData.imageURL);
        await deleteObject(imageRef);
        console.log("Slot image deleted successfully.");
      }

      // Reset slot in Firestore
      await updateDoc(slotRef, {
        booked_by: null, // Reset booked_by reference
        status: "available",
        imageURL: "",
        expires_at: null,
        updated_at: serverTimestamp(),
        views: 0,
        likes: 0,
      });

      console.log("Slot reset successfully.");
    } catch (error) {
      console.error("Error resetting user slot:", error.message);
      throw error;
    }
  };

  // user profile related functions (new functions)

  const editUserProfile = async (userId, updates) => {
    const userRef = doc(db, "users", userId);

    try {
      // Step 1: Check if the user exists
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) {
        throw new Error("User not found.");
      }

      // Step 2: Handle profile image upload (if a new one is provided)
      if (updates.profile_image) {
        const filePath = `profile_pictures/${userId}`;
        const fileRef = ref(storage, filePath);

        await uploadBytesResumable(fileRef, updates.profile_image);
        updates.profile_imageURL = await getDownloadURL(fileRef);

        delete updates.profile_image;
      }

      // Step 3: Update Firestore document
      await updateDoc(userRef, updates);

      // Step 4: Fetch the updated user document
      const updatedUserDoc = await getDoc(userRef);
      return {
        success: true,
        message: "Profile updated successfully!",
        user: updatedUserDoc.data(),
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  };

  // const incrementProfileViewCount = async (userId, viewerId) => {
  //   if (!viewerId || viewerId === userId) {
  //     return { success: false, message: "Invalid viewer ID." };
  //   }

  //   const userRef = doc(db, "users", userId);
  //   const profileViewRef = doc(
  //     collection(userRef, "profile_view_ids"),
  //     viewerId
  //   );

  //   try {
  //     await runTransaction(db, async (transaction) => {
  //       const viewDoc = await transaction.get(profileViewRef);

  //       if (!viewDoc.exists()) {
  //         transaction.set(profileViewRef, {});

  //         transaction.update(userRef, {
  //           profile_views: increment(1),
  //         });
  //       }
  //     });

  //     return { success: true, message: "Profile view recorded successfully." };
  //   } catch (error) {
  //     return { success: false, message: error.message };
  //   }
  // };

  // const likeProfile = async (userId, likerId) => {
  //   if (!likerId || likerId === userId) {
  //     return { success: false, message: "Invalid liker ID." };
  //   }

  //   const userRef = doc(db, "users", userId);
  //   const profileLikeRef = doc(
  //     collection(userRef, "profile_like_ids"),
  //     likerId
  //   );

  //   try {
  //     await runTransaction(db, async (transaction) => {
  //       const likeDoc = await transaction.get(profileLikeRef);

  //       if (!likeDoc.exists()) {
  //         transaction.set(profileLikeRef, {});

  //         transaction.update(userRef, {
  //           profile_likes: increment(1),
  //         });
  //       }
  //     });

  //     return { success: true, message: "Profile like recorded successfully." };
  //   } catch (error) {
  //     return { success: false, message: error.message };
  //   }
  // };

  // const unlikeProfile = async (userId, likerId) => {
  //   if (!likerId || likerId === userId) {
  //     return { success: false, message: "Invalid liker ID." };
  //   }

  //   const userRef = doc(db, "users", userId);
  //   const profileLikeRef = doc(userRef, "profile_like_ids", likerId);

  //   try {
  //     await runTransaction(db, async (transaction) => {
  //       const likeDoc = await transaction.get(profileLikeRef);

  //       if (likeDoc.exists()) {
  //         transaction.delete(profileLikeRef);

  //         transaction.update(userRef, {
  //           profile_likes: increment(-1),
  //         });
  //       }
  //     });

  //     return { success: true, message: "Profile like removed successfully." };
  //   } catch (error) {
  //     return { success: false, message: error.message };
  //   }
  // };

  // const hasUserLikedProfile = async (userId, likerId) => {
  //   if (!likerId || likerId === userId) {
  //     return false;
  //   }

  //   const profileLikeRef = doc(
  //     db,
  //     "users",
  //     userId,
  //     "profile_like_ids",
  //     likerId
  //   );

  //   try {
  //     const likeDoc = await getDoc(profileLikeRef);
  //     return likeDoc.exists();
  //   } catch (error) {
  //     return false;
  //   }
  // };

  //  listen to slots in real-time

  const listenToSlotsWithUsersOptimized = (db, setSlots) => {
    const slotsCollection = collection(db, "slots");

    let userUnsubscribes = []; // Store active user listeners

    const unsubscribeSlots = onSnapshot(slotsCollection, async (snapshot) => {
      const slots = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Extract unique user IDs from booked_by references
      const userRefs = [
        ...new Set(slots.map((slot) => slot.booked_by?.id).filter(Boolean)),
      ];

      if (userRefs.length === 0) {
        setSlots(slots.map((slot) => ({ ...slot, user: null })));
        return;
      }

      // Unsubscribe previous user listeners to prevent memory leaks
      userUnsubscribes.forEach((unsub) => unsub());
      userUnsubscribes = [];

      const usersCollection = collection(db, "users");
      const usersMap = {};

      userRefs.forEach((userId) => {
        const userDocRef = doc(usersCollection, userId);

        // Listen to each user document in real-time
        const unsubscribeUser = onSnapshot(userDocRef, (userSnapshot) => {
          if (userSnapshot.exists()) {
            usersMap[userId] = { id: userId, ...userSnapshot.data() };
          } else {
            delete usersMap[userId]; // Handle deleted user
          }

          // Update slots with the latest user data
          const slotsWithUsers = slots.map((slot) => ({
            ...slot,
            user: slot.booked_by ? usersMap[slot.booked_by.id] || null : null,
          }));

          console.log(slotsWithUsers);
          setSlots(slotsWithUsers);
        });

        userUnsubscribes.push(unsubscribeUser);
      });
    });

    // Cleanup function to remove all listeners
    return () => {
      unsubscribeSlots();
      userUnsubscribes.forEach((unsub) => unsub());
    };
  };

  useEffect(() => {
    const unsubscribe = listenToSlotsWithUsersOptimized(db, setSlots);
    return () => unsubscribe();
  }, [db]); // Re-run if `db` changes

  return (
    <div className="container">
      <h2>Firebase Slot Booking Test</h2>

      <div className="section">
        <h3 style={{ color: "black" }}>Book a Slot</h3>
        <input
          type="text"
          placeholder="Enter slot ID (e.g., 0_0)"
          value={slot}
          onChange={(e) => setSlot(e.target.value)}
        />
        {/* <input type="file" onChange={(e) => setImage(e.target.files[0])} /> */}
        <button onClick={() => bookSlot(slot, userId)}>Book Slot</button>
        <button
          onClick={() =>
            createUser(
              userId,
              "sumit_sharma",
              "sumit sharma",
              "this is my bio",
              "mywebsite.com",
              image
            )
          }
        >
          Create User
        </button>

        {message && <p style={{ color: "black" }}>{message}</p>}
      </div>

      <div className="section">
        <h3 style={{ color: "black" }}>Upload Image</h3>
        <input
          type="text"
          placeholder="Enter slot ID (e.g., 0_0)"
          value={slot}
          onChange={(e) => setSlot(e.target.value)}
        />
        <input type="file" onChange={(e) => setImage(e.target.files[0])} />
        <button onClick={() => uploadImage(slot, userId, image)}>
          Upload the image
        </button>
        {message && <p style={{ color: "black" }}>{message}</p>}
        <button onClick={() => resetSlot(slot)}>Reset Slot</button>
        <button onClick={() => likeImage(slot, viewerId)}>
          Like the image
        </button>
        <button onClick={() => unlikeImage(slot, userId)}>
          Unlike the image
        </button>
        <button onClick={() => hasUserLikedSlot(slot, viewerId)}>
          has user liked slot
        </button>
        <button onClick={() => incrementUniqueViewCount(slot, userId)}>
          View count
        </button>
        <button onClick={() => incrementProfileViewCount(userId, viewerId)}>
          Profile View count
        </button>
        <button onClick={() => unlikeProfile(userId, viewerId)}>
          Unlike profile
        </button>
        <button onClick={() => deleteUserAccount(userId)}>
          Delete profile
        </button>
        <button onClick={() => editUserProfile(userId, updates)}>
          update profile
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "10px",
        }}
      >
        {slots.length > 0 ? (
          slots.map((image) => (
            <div key={image.id} style={{ textAlign: "center" }}>
              <img
                src={image.imageURL}
                alt={"alt"}
                style={{ width: "100%", height: "auto", borderRadius: "10px" }}
              />
              <p>Slot: {image.slot_id}</p>
            </div>
          ))
        ) : (
          <p>No images found</p>
        )}
      </div>
    </div>
  );
}

export default App;
