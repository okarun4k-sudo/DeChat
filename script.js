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

let currentUserData = null;
let currentGroupId = "geral"; 
let currentReplyTo = null;
let activeUnsub = null;

// --- ROTEADOR ---
const routes = {
    "login": renderLogin,
    "home": renderHome,
    "groups": renderGroups,
    "profile": renderProfile
};

function navigate(path) {
    const cleanPath = path.replace("/", "") || "home";
    window.history.pushState({}, "", "/" + cleanPath);
    handleRoute();
}

function handleRoute() {
    const path = window.location.pathname.replace("/", "") || "home";
    if (!auth.currentUser && path !== "login") return renderLogin();
    
    const renderer = routes[path] || routes.home;
    renderer();
}

window.onpopstate = handleRoute;

// --- AUTH LISTENER ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
            currentUserData = snap.data();
            handleRoute();
        } else {
            // Se o user não tem perfil, força criar um
            currentUserData = { displayName: "Novo Usuário", photo: "https://i.pravatar.cc/150", username: user.email.split('@')[0] };
            await setDoc(doc(db, "users", user.uid), currentUserData);
            handleRoute();
        }
    } else {
        renderLogin();
    }
});

// --- COMPONENTES DE UI ---

function renderNav() {
    const path = window.location.pathname.replace("/", "") || "home";
    return `
        <nav class="sidebar-nav">
            <div class="nav-icon ${path === 'home' ? 'active' : ''}" onclick="window.navigate('home')"><i class="fa-solid fa-house"></i></div>
            <div class="nav-icon ${path === 'groups' ? 'active' : ''}" onclick="window.navigate('groups')"><i class="fa-solid fa-users"></i></div>
            <div class="nav-icon" onclick="window.navigate('profile')" style="background-image: url('${currentUserData?.photo}')"></div>
            <div style="flex:1"></div>
            <div class="nav-icon" onclick="window.handleLogout()"><i class="fa-solid fa-right-from-bracket"></i></div>
        </nav>
    `;
}

// --- TELAS ---

function renderLogin() {
    document.getElementById('app').innerHTML = `
        <div class="auth-container">
            <div class="auth-card">
                <h1>Tachi Chat</h1>
                <p style="color: #666; margin-bottom: 30px;">Entre ou crie sua conta OLED</p>
                <div class="input-field">
                    <label>E-mail</label>
                    <input type="email" id="email" placeholder="seu@email.com">
                </div>
                <div class="input-field">
                    <label>Senha</label>
                    <input type="password" id="pass" placeholder="••••••••">
                </div>
                <button class="btn-primary" id="btn-auth">Entrar / Registrar</button>
                <button id="btn-reload" style="margin-top:15px; background:none; border:none; color:var(--muted); cursor:pointer;">Recarregar Página</button>
            </div>
        </div>
    `;

    document.getElementById('btn-auth').onclick = async () => {
        const e = document.getElementById('email').value;
        const p = document.getElementById('pass').value;
        try {
            await signInWithEmailAndPassword(auth, e, p);
        } catch {
            await createUserWithEmailAndPassword(auth, e, p);
        }
    };
    document.getElementById('btn-reload').onclick = () => location.reload();
}

function renderHome() {
    document.getElementById('app').innerHTML = `
        ${renderNav()}
        <div class="sidebar-sub">
            <div class="sub-header">Mensagens Diretas</div>
            <div class="channel-list">
                <div class="channel-item"><i class="fa-solid fa-user"></i> Amigo Exemplo (PV)</div>
            </div>
        </div>
        <div class="main-chat">
            <div class="chat-header">Página Inicial</div>
            <div class="messages-container" style="justify-content:center; align-items:center; text-align:center;">
                <h2 style="font-size: 24px;">Olá, ${currentUserData.displayName}!</h2>
                <p style="color:var(--muted)">Selecione o ícone de grupos para começar a conversar.</p>
            </div>
        </div>
    `;
}

function renderGroups() {
    document.getElementById('app').innerHTML = `
        ${renderNav()}
        <div class="sidebar-sub">
            <div class="sub-header">Canais do Grupo</div>
            <div class="channel-list">
                <div class="channel-item active" onclick="window.changeChannel('geral')"><i class="fa-solid fa-hashtag"></i> geral</div>
                <div class="channel-item" onclick="window.changeChannel('avisos')"><i class="fa-solid fa-hashtag"></i> avisos</div>
            </div>
            <button class="btn-primary" style="margin:10px; width:auto; font-size:12px;">+ Criar Canal</button>
        </div>
        <div class="main-chat">
            <div class="chat-header" id="channel-title"># geral</div>
            <div class="messages-container" id="chat-box"></div>
            <div class="chat-input-area">
                <div id="reply-preview" class="reply-ref hidden"></div>
                <div class="input-box">
                    <input type="text" id="msg-input" placeholder="Conversar em #geral...">
                    <i class="fa-solid fa-paper-plane" id="btn-send" style="color:var(--blurple); cursor:pointer;"></i>
                </div>
            </div>
        </div>
    `;
    startChatListener('geral');
    
    document.getElementById('btn-send').onclick = () => handleSendMessage();
    document.getElementById('msg-input').onkeypress = (e) => { if(e.key === 'Enter') handleSendMessage(); };
}

function renderProfile() {
    document.getElementById('app').innerHTML = `
        ${renderNav()}
        <div class="main-chat" style="align-items:center; justify-content:center;">
            <div class="auth-card" style="width: 100%; max-width: 500px;">
                <img src="${currentUserData.photo}" style="width:100px; height:100px; border-radius:50%; margin-bottom:20px; border:3px solid var(--blurple);">
                <div class="input-field">
                    <label>Nome de Exibição</label>
                    <input type="text" id="edit-name" value="${currentUserData.displayName}">
                </div>
                <div class="input-field">
                    <label>URL da Foto</label>
                    <input type="text" id="edit-photo" value="${currentUserData.photo}">
                </div>
                <button class="btn-primary" id="btn-save-profile">Salvar Alterações</button>
            </div>
        </div>
    `;

    document.getElementById('btn-save-profile').onclick = async () => {
        const name = document.getElementById('edit-name').value;
        const photo = document.getElementById('edit-photo').value;
        await updateDoc(doc(db, "users", auth.currentUser.uid), { displayName: name, photo: photo });
        alert("Perfil atualizado!");
        location.reload();
    };
}

// --- FUNÇÕES DE CHAT ---

function startChatListener(channelId) {
    if(activeUnsub) activeUnsub();
    const q = query(collection(db, "channels", channelId, "messages"), orderBy("time", "asc"));
    
    activeUnsub = onSnapshot(q, (snap) => {
        const box = document.getElementById('chat-box');
        if(!box) return;
        box.innerHTML = "";
        snap.forEach(d => {
            const m = d.data();
            const isMe = m.uid === auth.currentUser.uid;
            
            const msgDiv = document.createElement('div');
            msgDiv.className = 'message';
            msgDiv.oncontextmenu = (e) => { e.preventDefault(); handleMessageAction(d.id, m, isMe); };
            // Para Mobile (Toque longo)
            let timer;
            msgDiv.ontouchstart = () => timer = setTimeout(() => handleMessageAction(d.id, m, isMe), 600);
            msgDiv.ontouchend = () => clearTimeout(timer);

            msgDiv.innerHTML = `
                <img src="${m.photo}">
                <div class="msg-content">
                    ${m.replyTo ? `<div class="reply-ref">Repondendo a ${m.replyTo.name}: ${m.replyTo.text.substring(0,20)}...</div>` : ''}
                    <b>${m.name}</b> <small>${m.time?.toDate().toLocaleTimeString() || 'Agora'}</small>
                    <div class="msg-text">${m.text}</div>
                </div>
            `;
            box.appendChild(msgDiv);
        });
        box.scrollTop = box.scrollHeight;
    });
}

async function handleSendMessage() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if(!text) return;

    const msgData = {
        text,
        uid: auth.currentUser.uid,
        name: currentUserData.displayName,
        photo: currentUserData.photo,
        time: serverTimestamp(),
        replyTo: currentReplyTo
    };

    input.value = "";
    currentReplyTo = null;
    document.getElementById('reply-preview').classList.add('hidden');
    
    await addDoc(collection(db, "channels", currentGroupId, "messages"), msgData);
}

function handleMessageAction(id, data, isMe) {
    const action = confirm(isMe ? "Deseja APAGAR ou RESPONDER?" : "Deseja RESPONDER?");
    if(action && isMe) {
        if(confirm("Confirmar exclusão?")) deleteDoc(doc(db, "channels", currentGroupId, "messages", id));
    } else if(action) {
        currentReplyTo = { name: data.name, text: data.text };
        const rep = document.getElementById('reply-preview');
        rep.innerText = `Respondendo a ${data.name}...`;
        rep.classList.remove('hidden');
    }
}

// --- GLOBALS PARA ONCLICK ---
window.navigate = navigate;
window.handleLogout = () => signOut(auth);
window.changeChannel = (id) => {
    currentGroupId = id;
    document.getElementById('channel-title').innerText = "# " + id;
    startChatListener(id);
};

// Inicia no home
handleRoute();
