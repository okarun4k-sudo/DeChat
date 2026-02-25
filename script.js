import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
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
let currentChannel = "geral";
let currentReply = null;
let selectedMsgId = null;
let selectedMsgData = null;
let activeUnsub = null;

// --- ROTEADOR ---
window.navigate = (path) => {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.getElementById('bottom-nav').classList.remove('hidden');
    
    if (path === 'groups') renderGroups();
    if (path === 'friends') renderFriends();
    if (path === 'profile') renderProfile();
};

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const snap = await getDoc(doc(db, "users", user.uid));
        userLogged = snap.data();
        navigate('groups');
    } else {
        renderLogin();
    }
});

// --- AUTH E ESQUECI SENHA ---
window.handleAuth = async () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('pass').value;
    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (e) {
        if (confirm("Conta não encontrada. Deseja criar uma nova?")) {
            const res = await createUserWithEmailAndPassword(auth, email, pass);
            const userData = { uid: res.user.uid, displayName: email.split('@')[0], username: email.split('@')[0], photo: "https://i.pravatar.cc/150", bio: "" };
            await setDoc(doc(db, "users", res.user.uid), userData);
            await setDoc(doc(db, "usernames", userData.username.toLowerCase()), { uid: res.user.uid });
            location.reload();
        }
    }
};

window.forgotPassword = async () => {
    const email = prompt("Digite seu e-mail para recuperar a senha:");
    if (email) {
        await sendPasswordResetEmail(auth, email);
        alert("E-mail de recuperação enviado!");
    }
};

// --- RENDERIZADORES ---

function renderLogin() {
    document.getElementById('bottom-nav').classList.add('hidden');
    document.getElementById('app').innerHTML = `
        <div class="auth-container" style="padding:40px; text-align:center;">
            <h1 style="margin-bottom:30px;">Tachi Chat</h1>
            <input type="email" id="email" placeholder="E-mail" class="modal-input" style="width:100%; padding:15px; margin-bottom:10px; background:#111; color:white; border:1px solid #222; border-radius:8px;">
            <input type="password" id="pass" placeholder="Senha" style="width:100%; padding:15px; background:#111; color:white; border:1px solid #222; border-radius:8px;">
            <button onclick="forgotPassword()" style="display:block; margin: 10px 0; color:var(--blurple); background:none; border:none;">Esqueci minha senha</button>
            <button class="btn-primary" onclick="handleAuth()">Entrar / Registrar</button>
        </div>
    `;
}

function renderProfile() {
    document.getElementById('app').innerHTML = `
        <div class="profile-screen">
            <div class="discord-banner"><img src="${userLogged.photo}" class="p-avatar-big"></div>
            <div class="p-content" style="background:#111; padding:50px 20px 20px; border-radius:0 0 15px 15px;">
                <h2>${userLogged.displayName}</h2>
                <p style="color:var(--muted)">@${userLogged.username}</p>
                <button class="btn-primary" style="margin-top:20px;" onclick="editProfile()">Editar Perfil</button>
                <button onclick="auth.signOut()" style="margin-top:20px; color:var(--danger); background:none; border:none; width:100%;">Sair da Conta</button>
            </div>
        </div>
    `;
}

function renderFriends() {
    document.getElementById('app').innerHTML = `
        <div class="chat-container">
            <div class="search-header">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input type="text" id="search-input" placeholder="Pesquisar @username de amigos">
                <i class="fa-solid fa-chevron-right" onclick="searchFriend()"></i>
            </div>
            <div id="friends-list" style="padding:15px;">
                <p style="color:var(--muted); text-align:center;">Pesquise um nome para iniciar um PV</p>
            </div>
        </div>
    `;
}

function renderGroups() {
    document.getElementById('app').innerHTML = `
        <div class="chat-container">
            <div class="chat-header">
                <span># ${currentChannel}</span>
                <div class="header-actions">
                    <i class="fa-solid fa-user-plus" onclick="addUserToGroup()"></i>
                    <i class="fa-solid fa-folder-plus" onclick="showCreateChannel()"></i>
                </div>
            </div>
            <div id="messages" class="msg-list"></div>
            <div class="input-area">
                <div id="reply-box" class="reply-preview hidden">
                    <span id="reply-text"></span><i class="fa-solid fa-xmark" onclick="cancelReply()"></i>
                </div>
                <div class="input-wrap">
                    <input type="text" id="msg-input" placeholder="Mensagem em #${currentChannel}">
                    <i class="fa-solid fa-paper-plane" onclick="sendMsg()" style="color:var(--blurple)"></i>
                </div>
            </div>
        </div>
    `;
    setupChat(currentChannel);
}

// --- FUNÇÕES DE CHAT E MENUS ---

function setupChat(chanId) {
    if(activeUnsub) activeUnsub();
    const q = query(collection(db, "groups", "main", "channels", chanId, "messages"), orderBy("time", "asc"));
    activeUnsub = onSnapshot(q, (snap) => {
        const box = document.getElementById('messages');
        if(!box) return; box.innerHTML = "";
        snap.forEach(d => {
            const m = d.data();
            const div = document.createElement('div');
            div.className = "message";
            div.onclick = () => openMsgMenu(d.id, m);
            div.innerHTML = `
                <img src="${m.photo}">
                <div class="msg-body">
                    ${m.replyTo ? `<div style="font-size:11px; color:var(--muted)">Repondendo a ${m.replyTo.name}</div>` : ''}
                    <b>${m.name}</b>
                    <p>${m.text}</p>
                </div>
            `;
            box.appendChild(div);
        });
        box.scrollTop = box.scrollHeight;
    });
}

window.openMsgMenu = (id, data) => {
    selectedMsgId = id;
    selectedMsgData = data;
    document.getElementById('overlay').classList.remove('hidden');
    document.getElementById('msg-menu').classList.remove('hidden');
    
    // Só mostra editar/apagar se a mensagem for sua
    const isMine = data.uid === auth.currentUser.uid;
    document.getElementById('menu-edit-btn').style.display = isMine ? 'flex' : 'none';
    document.getElementById('menu-del-btn').style.display = isMine ? 'flex' : 'none';
};

window.menuDelete = async () => {
    if(confirm("Apagar esta mensagem?")) {
        await deleteDoc(doc(db, "groups", "main", "channels", currentChannel, "messages", selectedMsgId));
        closeAllModals();
    }
};

window.menuEdit = async () => {
    const newText = prompt("Editar mensagem:", selectedMsgData.text);
    if(newText) {
        await updateDoc(doc(db, "groups", "main", "channels", currentChannel, "messages", selectedMsgId), { text: newText });
    }
    closeAllModals();
};

window.menuReply = () => {
    currentReply = { name: selectedMsgData.name, text: selectedMsgData.text };
    document.getElementById('reply-box').classList.remove('hidden');
    document.getElementById('reply-text').innerText = `Respondendo a ${selectedMsgData.name}`;
    closeAllModals();
};

window.closeAllModals = () => {
    document.getElementById('overlay').classList.add('hidden');
    document.getElementById('msg-menu').classList.add('hidden');
    document.getElementById('modal-create').classList.add('hidden');
};

// --- GRUPOS E CANAIS ---
window.showCreateChannel = () => {
    document.getElementById('overlay').classList.remove('hidden');
    document.getElementById('modal-create').classList.remove('hidden');
};

window.confirmCreateChannel = () => {
    const name = document.getElementById('new-channel-name').value.toLowerCase();
    if(name) {
        currentChannel = name;
        setupChat(name);
        closeAllModals();
    }
};

window.addUserToGroup = async () => {
    const username = prompt("Digite o @nome_de_usuario para convidar:");
    if(username) alert("Usuário " + username + " convidado com sucesso!");
};

// --- PERFIL E AMIGOS ---
window.editProfile = async () => {
    const newDisplay = prompt("Nome de Exibição:", userLogged.displayName);
    const newUsername = prompt("Nome de Usuário (@):", userLogged.username);
    const newPhoto = prompt("URL da Foto de Perfil:", userLogged.photo);
    
    if(newDisplay || newUsername || newPhoto) {
        await updateDoc(doc(db, "users", auth.currentUser.uid), {
            displayName: newDisplay || userLogged.displayName,
            username: newUsername || userLogged.username,
            photo: newPhoto || userLogged.photo
        });
        location.reload();
    }
};

window.searchFriend = async () => {
    const user = document.getElementById('search-input').value.toLowerCase();
    const snap = await getDoc(doc(db, "usernames", user));
    if(snap.exists()) {
        const u = await getDoc(doc(db, "users", snap.data().uid));
        const data = u.data();
        document.getElementById('friends-list').innerHTML = `
            <div class="message" style="background:#111; padding:15px; border-radius:12px;">
                <img src="${data.photo}">
                <div class="msg-body">
                    <b>${data.displayName}</b>
                    <p>@${data.username}</p>
                    <button class="btn-primary" style="margin-top:10px; padding:8px;" onclick="alert('PV iniciado!')">Enviar Mensagem</button>
                </div>
            </div>
        `;
    } else {
        alert("Usuário não encontrado.");
    }
};

window.sendMsg = async () => {
    const input = document.getElementById('msg-input');
    if(!input.value) return;
    const text = input.value;
    input.value = "";
    await addDoc(collection(db, "groups", "main", "channels", currentChannel, "messages"), {
        text, uid: auth.currentUser.uid, name: userLogged.displayName, 
        photo: userLogged.photo, time: serverTimestamp(), replyTo: currentReply
    });
    currentReply = null;
    document.getElementById('reply-box').classList.add('hidden');
};
