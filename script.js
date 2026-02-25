import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
let currentGroup = null;
let currentChannel = "geral";
let unsubMessages = null;

// --- ROTEADOR SPA ---
window.navigate = (path) => {
    const appEl = document.getElementById('app');
    const nav = document.getElementById('bottom-nav');
    
    if(!auth.currentUser && path !== 'login') return renderLogin();
    nav.classList.remove('hidden');

    if(path === 'home') renderHome();
    if(path === 'groups') renderGroups();
    if(path === 'friends') renderFriends();
    if(path === 'profile') renderProfile();
};

// --- AUTH LISTENER ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const snap = await getDoc(doc(db, "users", user.uid));
        userLogged = snap.data();
        navigate('home');
    } else {
        renderLogin();
    }
});

// --- RENDERIZADORES ---

function renderLogin() {
    document.getElementById('bottom-nav').classList.add('hidden');
    document.getElementById('app').innerHTML = `
        <div class="auth-screen" style="padding:40px; text-align:center;">
            <h1>Tachi Chat</h1>
            <input type="email" id="email" placeholder="E-mail" style="width:100%; padding:15px; margin:10px 0; border-radius:8px; background:#111; color:white; border:1px solid #333;">
            <input type="password" id="pass" placeholder="Senha" style="width:100%; padding:15px; margin:10px 0; border-radius:8px; background:#111; color:white; border:1px solid #333;">
            <button onclick="handleAuth()" class="btn-primary" style="width:100%; padding:15px; background:var(--blurple); border:none; color:white; font-weight:bold; border-radius:8px;">Entrar / Registrar</button>
        </div>
    `;
}

function renderProfile() {
    document.getElementById('app').innerHTML = `
        <div class="profile-screen">
            <div class="discord-card">
                <div class="banner">
                    <img src="${userLogged.photo}" class="p-avatar">
                </div>
                <div class="p-info">
                    <h2>${userLogged.displayName}</h2>
                    <p>@${userLogged.username}</p>
                    <div class="p-divider"></div>
                    <label style="font-size:12px; font-weight:bold; color:var(--muted);">SOBRE MIM</label>
                    <p style="margin-top:5px;">${userLogged.bio || 'Olá! Estou usando o Tachi.'}</p>
                    <button onclick="openEditProfile()" style="width:100%; padding:10px; background:#333; color:white; border:none; border-radius:4px;">Editar Perfil</button>
                    <button onclick="auth.signOut()" style="width:100%; margin-top:10px; color:var(--danger); background:none; border:none;">Sair da Conta</button>
                </div>
            </div>
        </div>
    `;
}

function renderGroups() {
    document.getElementById('app').innerHTML = `
        <div class="chat-container">
            <div class="chat-header">
                <i class="fa-solid fa-hashtag"></i> <span id="chan-name">geral</span>
            </div>
            <div id="messages" class="msg-list"></div>
            <div class="input-area">
                <div class="input-wrapper">
                    <i class="fa-solid fa-circle-plus"></i>
                    <input type="text" id="msg-input" placeholder="Conversar...">
                    <i class="fa-solid fa-paper-plane" onclick="sendMsg()"></i>
                </div>
            </div>
        </div>
    `;
    setupChat("grupo_exemplo_1", "geral");
}

// --- FUNÇÕES DE CHAT ---

function setupChat(groupId, chanId) {
    if(unsubMessages) unsubMessages();
    const q = query(collection(db, "groups", groupId, "channels", chanId, "messages"), orderBy("time", "asc"));
    
    unsubMessages = onSnapshot(q, (snap) => {
        const box = document.getElementById('messages');
        if(!box) return;
        box.innerHTML = "";
        snap.forEach(d => {
            const m = d.data();
            box.innerHTML += `
                <div class="message" oncontextmenu="handleMsgAction('${d.id}', '${m.uid}')">
                    <img src="${m.photo}">
                    <div class="msg-body">
                        <b>${m.name}</b>
                        <p>${m.text}</p>
                    </div>
                </div>
            `;
        });
        box.scrollTop = box.scrollHeight;
    });
}

window.sendMsg = async () => {
    const input = document.getElementById('msg-input');
    if(!input.value) return;
    await addDoc(collection(db, "groups", "grupo_exemplo_1", "channels", "geral", "messages"), {
        text: input.value,
        uid: auth.currentUser.uid,
        name: userLogged.displayName,
        photo: userLogged.photo,
        time: serverTimestamp()
    });
    input.value = "";
};

// --- EDITAR PERFIL ---
window.openEditProfile = () => {
    const newName = prompt("Novo nome de exibição:", userLogged.displayName);
    const newBio = prompt("Nova Bio:", userLogged.bio || "");
    if(newName) {
        updateDoc(doc(db, "users", auth.currentUser.uid), { displayName: newName, bio: newBio });
        location.reload();
    }
};

// --- AMIGOS (BUSCA) ---
function renderFriends() {
    document.getElementById('app').innerHTML = `
        <div style="padding:20px;">
            <h3>Adicionar Amigos</h3>
            <input type="text" id="search-friend" placeholder="Digite o @username" style="width:100%; padding:15px; background:#111; color:white; border:none; border-radius:8px; margin-top:10px;">
            <button onclick="searchUser()" style="width:100%; margin-top:10px; background:var(--blurple); color:white; padding:12px; border:none; border-radius:8px;">Buscar</button>
            <div id="friend-res" style="margin-top:20px;"></div>
        </div>
    `;
}

window.searchUser = async () => {
    const name = document.getElementById('search-friend').value.toLowerCase();
    const snap = await getDoc(doc(db, "usernames", name));
    if(snap.exists()) {
        const u = await getDoc(doc(db, "users", snap.data().uid));
        const data = u.data();
        document.getElementById('friend-res').innerHTML = `
            <div class="message" style="background:#111; padding:10px; border-radius:8px;">
                <img src="${data.photo}">
                <div class="msg-body">
                    <b>${data.displayName}</b>
                    <button style="display:block; color:var(--blurple); background:none; border:none; margin-top:5px;">Adicionar</button>
                </div>
            </div>
        `;
    } else {
        alert("Usuário não encontrado!");
    }
};
