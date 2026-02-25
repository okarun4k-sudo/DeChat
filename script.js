import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, query, where, onSnapshot, addDoc, updateDoc, arrayUnion, deleteDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// COLOQUE SEU CONFIG AQUI
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

// --- LOGIN SPA ---
document.getElementById('btn-auth').onclick = async () => {
    const email = document.getElementById('email-input').value;
    const pass = document.getElementById('password-input').value;
    if(!email || !pass) return alert("Preencha tudo!");
    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (e) {
        try { await createUserWithEmailAndPassword(auth, email, pass); }
        catch (err) { alert("Erro: " + err.message); }
    }
};

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const uSnap = await getDoc(doc(db, "users", user.uid));
        if (!uSnap.exists()) {
            openModal('modal-profile');
            toggleProfileEdit(true); // Força edição se for novo
        } else {
            userLogged = uSnap.data();
            updateProfileUI();
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
function updateProfileUI() {
    document.getElementById('view-p-name').innerText = userLogged.displayName;
    document.getElementById('view-p-username').innerText = "@" + userLogged.username;
    document.getElementById('view-p-bio').innerText = userLogged.bio || "Sem bio definida.";
    document.getElementById('view-p-photo').src = userLogged.photo;
    
    // Preencher campos de edição
    document.getElementById('p-name').value = userLogged.displayName;
    document.getElementById('p-username').value = userLogged.username;
    document.getElementById('p-photo').value = userLogged.photo;
    document.getElementById('p-bio').value = userLogged.bio;
}

function toggleProfileEdit(isEditing) {
    document.getElementById('profile-view-mode').classList.toggle('hidden', isEditing);
    document.getElementById('profile-edit-mode').classList.toggle('hidden', !isEditing);
}

document.getElementById('btn-edit-profile-toggle').onclick = () => {
    const isEditing = document.getElementById('profile-view-mode').classList.contains('hidden');
    toggleProfileEdit(!isEditing);
};

document.getElementById('btn-save-profile').onclick = async () => {
    const username = document.getElementById('p-username').value.trim().toLowerCase();
    const displayName = document.getElementById('p-name').value;
    const photo = document.getElementById('p-photo').value || "https://via.placeholder.com/150";
    const bio = document.getElementById('p-bio').value;

    if (username.length < 3) return alert("Username muito curto!");

    // Se mudou o username, checa se existe
    if (userLogged && userLogged.username !== username) {
        const nameCheck = await getDoc(doc(db, "usernames", username));
        if (nameCheck.exists()) return alert("Username em uso!");
    }

    const data = { uid: auth.currentUser.uid, username, displayName, photo, bio };
    await setDoc(doc(db, "users", auth.currentUser.uid), data);
    await setDoc(doc(db, "usernames", username), { uid: auth.currentUser.uid });
    
    alert("Perfil salvo!");
    location.reload();
};

// --- CHAT & MENSAGENS ---
function openChat(id, data) {
    currentGroupId = id;
    document.getElementById('chat-title').innerHTML = `<i class="fa-solid fa-hashtag"></i> ${data.name}`;
    document.getElementById('chat-input-container').classList.remove('hidden');
    document.getElementById('btn-group-settings').classList.toggle('hidden', data.admin !== auth.currentUser.uid);
    
    if (window.innerWidth < 768) document.getElementById('main-sidebar').classList.remove('open');

    if (unsubMessages) unsubMessages();
    const q = query(collection(db, "groups", id, "messages"), orderBy("time", "asc"));
    unsubMessages = onSnapshot(q, (snap) => {
        const box = document.getElementById('chat-messages');
        box.innerHTML = "";
        snap.forEach(mDoc => {
            const m = mDoc.data();
            const time = m.time?.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            box.innerHTML += `
                <div class="msg-item">
                    <img src="${m.photo}" class="msg-img">
                    <div class="msg-info">
                        <b>${m.name}</b> <small>${time || 'agora'}</small>
                        <p>${m.text}</p>
                    </div>
                </div>`;
        });
        box.scrollTop = box.scrollHeight;
    });
    listenTyping(id);
}

// Enviar mensagem
document.getElementById('msg-input').onkeypress = async (e) => {
    if (e.key === 'Enter' && e.target.value.trim() !== "") {
        const text = e.target.value;
        e.target.value = "";
        await addDoc(collection(db, "groups", currentGroupId, "messages"), {
            text, name: userLogged.displayName, username: userLogged.username, photo: userLogged.photo, time: new Date()
        });
        deleteDoc(doc(db, "groups", currentGroupId, "typing", auth.currentUser.uid));
    }
};

// --- DIGITANDO ---
document.getElementById('msg-input').oninput = () => {
    setDoc(doc(db, "groups", currentGroupId, "typing", auth.currentUser.uid), { name: userLogged.displayName });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        deleteDoc(doc(db, "groups", currentGroupId, "typing", auth.currentUser.uid));
    }, 2000);
};

function listenTyping(id) {
    if (unsubTyping) unsubTyping();
    unsubTyping = onSnapshot(collection(db, "groups", id, "typing"), (snap) => {
        const typers = [];
        snap.forEach(d => { if (d.id !== auth.currentUser.uid) typers.push(d.data().name); });
        document.getElementById('typing-text').innerText = typers.length ? typers.join(', ') + " está digitando..." : "";
    });
}

// --- GRUPOS ---
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

document.getElementById('btn-confirm-group').onclick = async () => {
    const name = document.getElementById('g-name').value;
    const photo = document.getElementById('g-photo').value || "https://via.placeholder.com/150";
    const desc = document.getElementById('g-desc').value;
    if(!name) return alert("Dê um nome ao grupo!");

    await addDoc(collection(db, "groups"), {
        name, photo, desc, admin: auth.currentUser.uid, members: [auth.currentUser.uid]
    });
    closeModals();
};

// --- NAVEGAÇÃO E MODAIS ---
function openModal(id) {
    document.getElementById('overlay').classList.remove('hidden');
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}
function closeModals() { 
    document.getElementById('overlay').classList.add('hidden');
    toggleProfileEdit(false);
}

document.getElementById('overlay').onclick = (e) => { if(e.target.id === 'overlay') closeModals(); };
document.getElementById('btn-view-profile').onclick = () => openModal('modal-profile');
document.getElementById('btn-dots').onclick = () => document.getElementById('menu-dropdown').classList.toggle('show');
document.getElementById('btn-plus').onclick = () => openModal('modal-plus');
document.getElementById('btn-show-search').onclick = () => openModal('modal-search');
document.getElementById('btn-show-create-group').onclick = () => openModal('modal-create-group');
document.getElementById('btn-logout').onclick = () => signOut(auth);
document.getElementById('mobile-menu-btn').onclick = () => document.getElementById('main-sidebar').classList.toggle('open');
document.getElementById('btn-go-home').onclick = () => location.reload();

// Busca Amigo
document.getElementById('btn-exec-search').onclick = async () => {
    const userSearch = document.getElementById('search-username').value.toLowerCase();
    const snap = await getDoc(doc(db, "usernames", userSearch));
    const res = document.getElementById('search-res');
    if (snap.exists()) {
        const userData = (await getDoc(doc(db, "users", snap.data().uid))).data();
        res.innerHTML = `
            <div class="msg-item" style="margin-top:15px; background:#111; padding:10px; border-radius:8px;">
                <img src="${userData.photo}" class="msg-img">
                <div>
                    <b>${userData.displayName}</b>
                    <p>${userData.bio}</p>
                </div>
            </div>`;
    } else res.innerHTML = "Usuário não encontrado.";
};
