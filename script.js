import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, query, where, onSnapshot, addDoc, updateDoc, arrayUnion, deleteDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyD9LDSyd2x2n4Dt6PIQJjLrAltDBWgT2Do",
    authDomain: "mensagem-2f134.firebaseapp.com",
    projectId: "mensagem-2f134",
    storageBucket: "mensagem-2f134.firebasestorage.app",
    messagingSenderId: "1001126917394",
    appId: "1:1001126917394:web:7069c87f494af89cf66fcb"
  };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let userLogged = null;
let currentGroupId = null;
let unsubMessages = null;
let unsubTyping = null;
let typingTimeout = null;

// --- AUTH ---
document.getElementById('btn-auth').onclick = async () => {
    const email = document.getElementById('email-input').value;
    const pass = document.getElementById('password-input').value;
    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (e) {
        try { await createUserWithEmailAndPassword(auth, email, pass); }
        catch (err) { alert(err.message); }
    }
};

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const uSnap = await getDoc(doc(db, "users", user.uid));
        if (!uSnap.exists()) {
            openModal('modal-profile');
        } else {
            userLogged = uSnap.data();
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('app-screen').classList.remove('hidden');
            loadGroups();
        }
    } else {
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('app-screen').classList.add('hidden');
    }
});

// --- PERFIL ---
document.getElementById('btn-save-profile').onclick = async () => {
    const username = document.getElementById('p-username').value.trim().toLowerCase();
    const name = document.getElementById('p-name').value;
    const photo = document.getElementById('p-photo').value || "https://via.placeholder.com/150";
    const bio = document.getElementById('p-bio').value;

    if (!username || !name) return alert("Preencha nome e username!");

    const nameCheck = await getDoc(doc(db, "usernames", username));
    if (nameCheck.exists() && !userLogged) return alert("Username já existe!");

    const data = { uid: auth.currentUser.uid, username, displayName: name, photo, bio };
    await setDoc(doc(db, "users", auth.currentUser.uid), data);
    await setDoc(doc(db, "usernames", username), { uid: auth.currentUser.uid });
    location.reload();
};

// --- GRUPOS ---
document.getElementById('btn-confirm-group').onclick = async () => {
    const name = document.getElementById('g-name').value;
    const photo = document.getElementById('g-photo').value || "https://via.placeholder.com/150";
    const desc = document.getElementById('g-desc').value;

    await addDoc(collection(db, "groups"), {
        name, photo, desc,
        admin: auth.currentUser.uid,
        members: [auth.currentUser.uid]
    });
    closeModals();
};

function loadGroups() {
    const q = query(collection(db, "groups"), where("members", "array-contains", auth.currentUser.uid));
    onSnapshot(q, (snap) => {
        const list = document.getElementById('groups-list');
        list.innerHTML = "";
        snap.forEach(gDoc => {
            const g = gDoc.data();
            const el = document.createElement('div');
            el.className = "server-icon";
            el.style.backgroundImage = `url('${g.photo}')`;
            el.onclick = () => openChat(gDoc.id, g);
            list.appendChild(el);
        });
    });
}

// --- CHAT EM TEMPO REAL ---
function openChat(id, data) {
    currentGroupId = id;
    document.getElementById('chat-title').innerText = data.name;
    document.getElementById('msg-input').disabled = false;
    document.getElementById('btn-group-settings').classList.toggle('hidden', data.admin !== auth.currentUser.uid);

    if (unsubMessages) unsubMessages();
    const q = query(collection(db, "groups", id, "messages"), orderBy("time", "asc"));
    unsubMessages = onSnapshot(q, (snap) => {
        const box = document.getElementById('chat-messages');
        box.innerHTML = "";
        snap.forEach(mDoc => {
            const m = mDoc.data();
            box.innerHTML += `
                <div class="msg-item">
                    <img src="${m.photo}" class="msg-img">
                    <div>
                        <b>${m.name}</b> <small>${m.username}</small>
                        <p>${m.text}</p>
                    </div>
                </div>`;
        });
        box.scrollTop = box.scrollHeight;
    });

    listenTyping(id);
}

// --- DIGITANDO ---
document.getElementById('msg-input').oninput = () => {
    setDoc(doc(db, "groups", currentGroupId, "typing", auth.currentUser.uid), { name: userLogged.username });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        deleteDoc(doc(db, "groups", currentGroupId, "typing", auth.currentUser.uid));
    }, 2000);
};

document.getElementById('msg-input').onkeypress = async (e) => {
    if (e.key === 'Enter') {
        const text = e.target.value;
        if (!text) return;
        await addDoc(collection(db, "groups", currentGroupId, "messages"), {
            text, name: userLogged.displayName, username: userLogged.username, photo: userLogged.photo, time: new Date()
        });
        e.target.value = "";
        deleteDoc(doc(db, "groups", currentGroupId, "typing", auth.currentUser.uid));
    }
};

function listenTyping(id) {
    if (unsubTyping) unsubTyping();
    unsubTyping = onSnapshot(collection(db, "groups", id, "typing"), (snap) => {
        const typers = [];
        snap.forEach(d => { if (d.id !== auth.currentUser.uid) typers.push(d.data().name); });
        document.getElementById('typing-text').innerText = typers.length ? typers.join(', ') + " está digitando..." : "";
    });
}

// --- MODAIS E UI ---
function openModal(id) {
    document.getElementById('overlay').classList.remove('hidden');
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}
function closeModals() { document.getElementById('overlay').classList.add('hidden'); }

document.getElementById('btn-plus').onclick = () => openModal('modal-plus');
document.getElementById('btn-show-search').onclick = () => openModal('modal-search');
document.getElementById('btn-show-create-group').onclick = () => openModal('modal-create-group');
document.getElementById('btn-open-profile').onclick = () => openModal('modal-profile');
document.getElementById('btn-dots').onclick = () => document.getElementById('menu-dropdown').classList.toggle('show');
document.getElementById('btn-logout').onclick = () => signOut(auth);

// --- ADICIONAR PESSOAS ---
document.getElementById('btn-add-member').onclick = async () => {
    const userSearch = document.getElementById('add-member-input').value.toLowerCase();
    const snap = await getDoc(doc(db, "usernames", userSearch));
    if (snap.exists()) {
        await updateDoc(doc(db, "groups", currentGroupId), { members: arrayUnion(snap.data().uid) });
        alert("Adicionado!");
    } else alert("Usuário não encontrado!");
};
