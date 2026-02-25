import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, orderBy, serverTimestamp, arrayUnion } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- CONFIGURAÇÃO FIREBASE ---
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
let activeUnsub = null;
let activeChannelsUnsub = null;
let replyData = null; // Armazena a mensagem que está sendo respondida

// --- ROTEADOR SPA ---
window.navigate = (path) => {
    window.history.pushState({}, "", path);
    handleRoute();
};

window.onpopstate = () => handleRoute();

function handleRoute() {
    const path = window.location.pathname;
    if (!userLogged) return renderLogin();
    
    document.getElementById('bottom-nav').classList.remove('hidden');

    if (path.startsWith('/servidor/')) {
        const parts = path.split('/');
        const serverId = parts[2];
        const channelId = parts[3] || 'geral';
        renderServer(serverId, channelId);
    } else if (path === '/chat') {
        renderDMs();
    } else if (path === '/perfil') {
        renderProfile();
    } else {
        renderHome();
    }
}

// --- AUTH OBSERVER ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const snap = await getDoc(doc(db, "users", user.uid));
        userLogged = snap.data();
        handleRoute();
    } else {
        userLogged = null;
        renderLogin();
    }
});

// --- TELAS ---

function renderLogin() {
    document.getElementById('bottom-nav').classList.add('hidden');
    document.getElementById('app').innerHTML = `
        <div class="modal" style="display:block; position:relative; top:0; left:0; transform:none; margin: 100px auto;">
            <h2 style="text-align:center; margin-bottom:20px;">Tachi Chat</h2>
            <input type="email" id="email" placeholder="E-mail" style="width:100%; padding:12px; margin-bottom:10px; background:#111; border:1px solid #333; color:white; border-radius:8px;">
            <input type="password" id="pass" placeholder="Senha" style="width:100%; padding:12px; margin-bottom:20px; background:#111; border:1px solid #333; color:white; border-radius:8px;">
            <button class="btn-primary" onclick="window.authAction()">Entrar / Cadastrar</button>
        </div>
    `;
}

window.authAction = async () => {
    const e = document.getElementById('email').value;
    const p = document.getElementById('pass').value;
    try {
        await signInWithEmailAndPassword(auth, e, p);
    } catch {
        const res = await createUserWithEmailAndPassword(auth, e, p);
        const username = e.split('@')[0] + Math.floor(Math.random() * 999);
        const userData = {
            uid: res.user.uid,
            email: e,
            displayName: username,
            username: username.toLowerCase(),
            photo: `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`,
            servers: []
        };
        await setDoc(doc(db, "users", res.user.uid), userData);
        await setDoc(doc(db, "usernames", userData.username), { uid: res.user.uid });
    }
};

async function renderHome() {
    const servers = await getServers();
    let serverIcons = servers.map(s => `
        <div class="srv-icon" style="background-image: url('${s.photo}')" onclick="navigate('/servidor/${s.id}')" title="${s.name}"></div>
    `).join('');

    document.getElementById('app').innerHTML = `
        <div class="main-layout">
            <aside class="server-sidebar">
                <div class="srv-icon active"><i class="fa-solid fa-house"></i></div>
                ${serverIcons}
                <div class="srv-icon" onclick="window.showCreateServer()"><i class="fa-solid fa-plus"></i></div>
            </aside>
            <main class="chat-container" style="justify-content:center; align-items:center; text-align:center; padding:20px; background: linear-gradient(to bottom, #050505, #000);">
                <div style="background: var(--dark-1); padding: 40px; border-radius: 20px; border: 1px solid #222; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                    <img src="${userLogged.photo}" style="width:100px; height:100px; border-radius:50%; margin-bottom:20px; border: 3px solid var(--blurple);">
                    <h2 style="font-size: 24px; margin-bottom: 10px;">Bem-vindo, ${userLogged.displayName}!</h2>
                    <p style="color:var(--muted); max-width: 300px; line-height: 1.6;">
                        ${servers.length === 0 ? 'O Tachi Chat é mais divertido com amigos. Que tal criar seu próprio espaço?' : 'Escolha um servidor ao lado para começar a conversar!'}
                    </p>
                    <button class="btn-primary" style="margin-top:30px; width:220px; transition: 0.3s;" onclick="window.showCreateServer()">
                        <i class="fa-solid fa-circle-plus"></i> Novo Servidor
                    </button>
                    <button class="btn-primary" style="margin-top:10px; width:220px; background: #333;" onclick="window.showJoinServer()">
                        <i class="fa-solid fa-link"></i> Entrar por Link
                    </button>
                </div>
            </main>
        </div>
    `;
}

// --- FUNÇÕES DE SERVIDOR ---

async function renderServer(serverId, channelId = 'geral') {
    const sDoc = await getDoc(doc(db, "groups", serverId));
    if (!sDoc.exists()) return navigate('/');
    const server = sDoc.data();
    const isAdmin = server.admin === auth.currentUser.uid;
    
    const servers = await getServers();
    let serverIcons = servers.map(s => `
        <div class="srv-icon ${s.id === serverId ? 'active' : ''}" style="background-image: url('${s.photo}')" onclick="navigate('/servidor/${s.id}')"></div>
    `).join('');

    document.getElementById('app').innerHTML = `
        <div class="main-layout">
            <aside class="server-sidebar">
                <div class="srv-icon" onclick="navigate('/')"><i class="fa-solid fa-house"></i></div>
                ${serverIcons}
                <div class="srv-icon" onclick="window.showCreateServer()"><i class="fa-solid fa-plus"></i></div>
            </aside>
            <aside class="channel-sidebar">
                <div class="chat-header">
                    <span>Canais</span>
                    ${isAdmin ? `<i class="fa-solid fa-plus" style="cursor:pointer; font-size:14px; margin-right:10px;" onclick="window.showCreateChannel('${serverId}')"></i>` : ''}
                    ${isAdmin ? `<i class="fa-solid fa-gear" style="cursor:pointer" onclick="window.showEditServer('${serverId}')"></i>` : ''}
                </div>
                <div style="padding: 10px 0; flex:1; overflow-y:auto;" id="channels-list"></div>
                <div class="chat-header" style="border-top: 1px solid #222; font-size:12px; color:var(--muted)">
                    <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${server.name}</span>
                </div>
            </aside>
            <main class="chat-container">
                <div class="chat-header"><span id="chan-title"># ${channelId}</span></div>
                <div class="msg-list" id="msg-list"></div>
                <div class="input-area" id="input-container">
                    </div>
            </main>
        </div>
    `;

    loadChannels(serverId, channelId);
    loadMessages(serverId, channelId);
}

function loadChannels(serverId, activeChan) {
    if (activeChannelsUnsub) activeChannelsUnsub();
    const q = collection(db, "groups", serverId, "channels");
    
    activeChannelsUnsub = onSnapshot(q, (snap) => {
        const list = document.getElementById('channels-list');
        if (!list) return;
        list.innerHTML = "";
        snap.forEach(d => {
            const chan = d.data();
            const el = document.createElement('div');
            el.className = `channel-item ${d.id === activeChan ? 'active' : ''}`;
            el.innerHTML = `<i class="fa-solid fa-hashtag"></i> ${d.id}`;
            el.onclick = () => navigate(`/servidor/${serverId}/${d.id}`);
            list.appendChild(el);

            if (d.id === activeChan) {
                renderInputArea(serverId, d.id, chan.readOnly);
            }
        });
    });
}

function renderInputArea(serverId, channelId, isReadOnly) {
    const isAdmin = (document.getElementById('channels-list').parentElement.innerHTML.includes('fa-gear'));
    const container = document.getElementById('input-container');
    
    if (channelId === 'boas-vindas' || (isReadOnly && !isAdmin)) {
        container.innerHTML = `<div style="text-align:center; color:var(--muted); font-size:13px; padding: 10px;">Você não tem permissão para enviar mensagens neste canal.</div>`;
    } else {
        container.innerHTML = `
            <div id="reply-preview-area"></div>
            <div class="input-wrapper">
                <input type="text" id="msg-input" placeholder="Conversar em #${channelId}">
                <i class="fa-solid fa-paper-plane" style="cursor:pointer; color:var(--blurple)" onclick="window.sendMsg('${serverId}', '${channelId}')"></i>
            </div>
        `;
        document.getElementById('msg-input').onkeypress = (e) => { if(e.key === 'Enter') window.sendMsg(serverId, channelId) };
    }
}

// --- MENSAGENS ---

function loadMessages(serverId, channelId) {
    if (activeUnsub) activeUnsub();
    const q = query(collection(db, "groups", serverId, "channels", channelId, "messages"), orderBy("time", "asc"));
    
    activeUnsub = onSnapshot(q, (snap) => {
        const list = document.getElementById('msg-list');
        if (!list) return;
        list.innerHTML = "";
        snap.forEach(d => {
            const m = d.data();
            const el = document.createElement('div');
            el.className = "message-wrapper"; // Container para agrupar badge de resposta e corpo

            let replyHtml = "";
            if (m.replyTo) {
                replyHtml = `<div class="reply-badge"><i class="fa-solid fa-reply"></i> respondendo a <b>${m.replyTo.name}</b>: "${m.replyTo.text}"</div>`;
            }

            el.innerHTML = `
                ${replyHtml}
                <div class="message">
                    <img src="${m.photo}" onclick="window.viewProfile('${m.uid}')">
                    <div class="msg-body">
                        <b onclick="window.viewProfile('${m.uid}')">${m.name}</b>
                        <div class="msg-text" onclick="window.openMsgMenu('${d.id}', '${m.uid}', '${m.text}', '${serverId}', '${channelId}', '${m.name}')">
                            ${m.text} ${m.edited ? '<span class="edited-tag">(editada)</span>' : ''}
                        </div>
                    </div>
                </div>
            `;
            list.appendChild(el);
        });
        list.scrollTop = list.scrollHeight;
    });
}

window.sendMsg = async (serverId, channelId) => {
    const input = document.getElementById('msg-input');
    if (!input || !input.value.trim()) return;
    const text = input.value;
    input.value = "";
    
    const msgData = {
        text,
        uid: auth.currentUser.uid,
        name: userLogged.displayName,
        photo: userLogged.photo,
        time: serverTimestamp(),
        edited: false
    };

    if (replyData) {
        msgData.replyTo = replyData;
        window.cancelReply(); // Limpa a resposta após enviar
    }
    
    await addDoc(collection(db, "groups", serverId, "channels", channelId, "messages"), msgData);
};

// --- FUNÇÃO DE RESPOSTA ---

window.replyMsg = (text, authorName) => {
    replyData = { text: text, name: authorName };
    const area = document.getElementById('reply-preview-area');
    if (area) {
        area.innerHTML = `
            <div class="reply-container">
                <span><i class="fa-solid fa-reply"></i> Respondendo a <b>${authorName}</b></span>
                <i class="fa-solid fa-xmark" style="cursor:pointer" onclick="window.cancelReply()"></i>
            </div>
        `;
    }
    closeAllModals();
    document.getElementById('msg-input').focus();
};

window.cancelReply = () => {
    replyData = null;
    const area = document.getElementById('reply-preview-area');
    if (area) area.innerHTML = "";
};

// --- DM COM PESQUISA ---
function renderDMs() {
    document.getElementById('app').innerHTML = `
        <div class="main-layout" style="flex-direction:column; padding:15px; background: var(--black);">
            <div class="input-wrapper" style="margin-bottom:20px; border:1px solid #222;">
                <i class="fa-solid fa-magnifying-glass" style="color:var(--muted)"></i>
                <input type="text" id="search-user-input" placeholder="Pesquisar @username para conversar...">
                <button class="btn-primary" style="width:auto; padding:5px 15px;" onclick="window.searchUser()">Buscar</button>
            </div>
            
            <div id="search-results" style="flex:1; overflow-y:auto;">
                 <div style="text-align:center; color:var(--muted); margin-top:50px;">
                    <i class="fa-solid fa-comment-dots" style="font-size:50px; margin-bottom:20px;"></i>
                    <h3>Suas Mensagens</h3>
                    <p>Procure um usuário acima para iniciar um chat.</p>
                </div>
            </div>
        </div>
    `;
}

window.searchUser = async () => {
    const username = document.getElementById('search-user-input').value.toLowerCase().trim();
    const results = document.getElementById('search-results');
    if(!username) return;
    
    const uSnap = await getDoc(doc(db, "usernames", username));
    if(uSnap.exists()) {
        const uid = uSnap.data().uid;
        const userData = (await getDoc(doc(db, "users", uid))).data();
        results.innerHTML = `
            <div class="channel-item" style="padding:15px; background:var(--dark-1); border:1px solid #222; border-radius:10px;" onclick="window.viewProfile('${uid}')">
                <img src="${userData.photo}" style="width:40px; height:40px; border-radius:50%; margin-right:15px;">
                <div style="flex:1">
                    <b>${userData.displayName}</b><br>
                    <span style="font-size:12px; color:var(--muted)">@${userData.username}</span>
                </div>
                <i class="fa-solid fa-chevron-right"></i>
            </div>
        `;
    } else {
        results.innerHTML = `<p style="text-align:center; color:var(--danger)">Usuário não encontrado.</p>`;
    }
};

// --- MODAIS E GESTÃO ---

window.showCreateChannel = (serverId) => {
    const modal = document.getElementById('modal-generic');
    modal.innerHTML = `
        <h3>Novo Canal</h3>
        <input type="text" id="new-chan-name" placeholder="nome-do-canal" style="width:100%; padding:12px; margin:15px 0; background:#111; border:1px solid #333; color:white; border-radius:8px;">
        <label style="display:flex; align-items:center; gap:10px; font-size:14px; color:var(--muted); margin-bottom:15px;">
            <input type="checkbox" id="chan-readonly"> Apenas Administradores podem falar
        </label>
        <button class="btn-primary" onclick="window.confirmCreateChannel('${serverId}')">Criar Canal</button>
    `;
    modal.classList.remove('hidden');
    document.getElementById('overlay').classList.remove('hidden');
};

window.confirmCreateChannel = async (serverId) => {
    const name = document.getElementById('new-chan-name').value.trim().toLowerCase().replace(/\s+/g, '-');
    const isRead = document.getElementById('chan-readonly').checked;
    if (!name) return;
    await setDoc(doc(db, "groups", serverId, "channels", name), { name, readOnly: isRead });
    closeAllModals();
};

window.showCreateServer = () => {
    const modal = document.getElementById('modal-generic');
    modal.innerHTML = `
        <h3>Criar Servidor</h3>
        <input type="text" id="new-srv-name" placeholder="Nome do Servidor" style="width:100%; padding:12px; margin:15px 0; background:#111; border:1px solid #333; color:white; border-radius:8px;">
        <button class="btn-primary" onclick="window.confirmCreateServer()">Criar Servidor</button>
    `;
    modal.classList.remove('hidden');
    document.getElementById('overlay').classList.remove('hidden');
};

window.confirmCreateServer = async () => {
    const name = document.getElementById('new-srv-name').value;
    if (!name) return;
    
    const srvRef = await addDoc(collection(db, "groups"), {
        name,
        photo: `https://api.dicebear.com/7.x/initials/svg?seed=${name}`,
        admin: auth.currentUser.uid,
        members: [auth.currentUser.uid]
    });

    await setDoc(doc(db, "groups", srvRef.id, "channels", "boas-vindas"), { name: "boas-vindas", readOnly: true });
    await setDoc(doc(db, "groups", srvRef.id, "channels", "geral"), { name: "geral", readOnly: false });
    
    await addDoc(collection(db, "groups", srvRef.id, "channels", "boas-vindas", "messages"), {
        text: `🚀 Bem-vindo ao servidor ${name}! O administrador criou este espaço para você.`,
        uid: "system",
        name: "Tachi Bot",
        photo: "https://api.dicebear.com/7.x/bottts/svg?seed=system",
        time: serverTimestamp()
    });

    await updateDoc(doc(db, "users", auth.currentUser.uid), {
        servers: arrayUnion(srvRef.id)
    });

    closeAllModals();
    navigate(`/servidor/${srvRef.id}/geral`);
};

window.showEditServer = async (serverId) => {
    const s = (await getDoc(doc(db, "groups", serverId))).data();
    const modal = document.getElementById('modal-generic');
    modal.innerHTML = `
        <h3>Editar Servidor</h3>
        <label style="font-size:12px; color:var(--muted)">NOME DO SERVIDOR</label>
        <input type="text" id="edit-srv-name" value="${s.name}" style="width:100%; padding:12px; margin:5px 0 15px; background:#111; border:1px solid #333; color:white; border-radius:8px;">
        
        <label style="font-size:12px; color:var(--muted)">URL DA FOTO</label>
        <input type="text" id="edit-srv-photo" value="${s.photo}" style="width:100%; padding:12px; margin:5px 0 15px; background:#111; border:1px solid #333; color:white; border-radius:8px;">

        <label style="font-size:12px; color:var(--muted)">CONVIDAR MEMBRO (@username)</label>
        <div style="display:flex; gap:5px; margin-top:5px; margin-bottom:15px;">
            <input type="text" id="add-member-user" placeholder="tachi123" style="flex:1; padding:12px; background:#111; border:1px solid #333; color:white; border-radius:8px;">
            <button class="btn-primary" style="width:auto; padding:0 15px;" onclick="window.addMember('${serverId}')">Add</button>
        </div>
        
        <div style="margin-top:15px; background:#111; padding:10px; border-radius:8px; border:1px dashed #333;">
            <p style="font-size:11px; color:var(--muted);">ID de Convite:</p>
            <b style="font-size:13px; color:var(--blurple); word-break:break-all;">${serverId}</b>
        </div>

        <button class="btn-primary" style="margin-top:20px;" onclick="window.saveServerEdit('${serverId}')">Salvar Alterações</button>
        <button class="btn-danger" style="margin-top:10px;" onclick="window.deleteServerPrompt('${serverId}')">Apagar Servidor</button>
    `;
    modal.classList.remove('hidden');
    document.getElementById('overlay').classList.remove('hidden');
};

window.deleteServerPrompt = (serverId) => {
    if(confirm("TEM CERTEZA? Isso vai apagar todas as mensagens e canais do servidor para SEMPRE.")) {
        window.confirmDeleteServer(serverId);
    }
};

window.confirmDeleteServer = async (serverId) => {
    await deleteDoc(doc(db, "groups", serverId));
    closeAllModals();
    navigate('/');
};

window.saveServerEdit = async (serverId) => {
    const name = document.getElementById('edit-srv-name').value;
    const photo = document.getElementById('edit-srv-photo').value;
    await updateDoc(doc(db, "groups", serverId), { name, photo });
    closeAllModals();
    renderServer(serverId);
};

window.showJoinServer = () => {
    const modal = document.getElementById('modal-generic');
    modal.innerHTML = `
        <h3>Entrar em Servidor</h3>
        <p style="font-size:12px; color:var(--muted); margin-bottom:10px;">Cole o ID do servidor abaixo:</p>
        <input type="text" id="join-srv-id" placeholder="ID do servidor" style="width:100%; padding:12px; margin-bottom:15px; background:#111; border:1px solid #333; color:white; border-radius:8px;">
        <button class="btn-primary" onclick="window.confirmJoinServer()">Entrar no Servidor</button>
    `;
    modal.classList.remove('hidden');
    document.getElementById('overlay').classList.remove('hidden');
};

window.confirmJoinServer = async () => {
    const sId = document.getElementById('join-srv-id').value.trim();
    if(!sId) return;
    const sDoc = await getDoc(doc(db, "groups", sId));
    if(sDoc.exists()) {
        await updateDoc(doc(db, "groups", sId), { members: arrayUnion(auth.currentUser.uid) });
        await updateDoc(doc(db, "users", auth.currentUser.uid), { servers: arrayUnion(sId) });
        closeAllModals();
        navigate(`/servidor/${sId}/geral`);
    } else {
        alert("Servidor não encontrado.");
    }
};

window.addMember = async (serverId) => {
    const username = document.getElementById('add-member-user').value.toLowerCase().trim();
    const uSnap = await getDoc(doc(db, "usernames", username));
    if (uSnap.exists()) {
        const uid = uSnap.data().uid;
        await updateDoc(doc(db, "groups", serverId), { members: arrayUnion(uid) });
        await updateDoc(doc(db, "users", uid), { servers: arrayUnion(serverId) });
        alert("Membro adicionado!");
    } else {
        alert("Usuário não encontrado.");
    }
};

function renderProfile() {
    document.getElementById('app').innerHTML = `
        <div class="main-layout" style="flex-direction:column; padding:20px; align-items:center; background: var(--black); overflow-y:auto;">
            <div style="position:relative;">
                <img src="${userLogged.photo}" id="profile-img-preview" style="width:120px; height:120px; border-radius:50%; border:4px solid var(--blurple); object-fit:cover;">
                <div onclick="window.editProfilePhoto()" style="position:absolute; bottom:0; right:0; background:var(--blurple); width:35px; height:35px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer;">
                    <i class="fa-solid fa-camera" style="font-size:14px;"></i>
                </div>
            </div>
            <h1 style="margin:15px 0 5px;">${userLogged.displayName}</h1>
            <p style="color:var(--muted); margin-bottom:30px;">@${userLogged.username}</p>
            
            <div style="width:100%; max-width:400px; background:var(--dark-1); padding:20px; border-radius:15px; border:1px solid #222; margin-bottom:100px;">
                <label style="font-size:12px; color:var(--muted)">NOME DE EXIBIÇÃO</label>
                <input type="text" id="edit-display-name" value="${userLogged.displayName}" style="width:100%; padding:12px; margin:5px 0 20px; background:#000; border:1px solid #333; color:white; border-radius:8px;">
                
                <label style="font-size:12px; color:var(--muted)">NOME DE USUÁRIO (@)</label>
                <input type="text" id="edit-username" value="${userLogged.username}" style="width:100%; padding:12px; margin:5px 0 20px; background:#000; border:1px solid #333; color:white; border-radius:8px;">

                <button class="btn-primary" onclick="window.saveProfile()">Salvar Perfil</button>
            </div>

            <button class="btn-danger" style="margin-top:20px; width:150px; background:none; border:1px solid var(--danger); color:var(--danger);" onclick="signOut(auth)">Sair da Conta</button>
        </div>
    `;
}

window.editProfilePhoto = () => {
    const newUrl = prompt("Insira a URL da nova foto de perfil:", userLogged.photo);
    if (newUrl) {
        document.getElementById('profile-img-preview').src = newUrl;
        userLogged.photo = newUrl;
    }
};

window.saveProfile = async () => {
    const newName = document.getElementById('edit-display-name').value;
    const newUsername = document.getElementById('edit-username').value.toLowerCase().trim().replace(/\s+/g, '');
    
    if(newUsername !== userLogged.username) {
        const check = await getDoc(doc(db, "usernames", newUsername));
        if(check.exists()) return alert("Este @username já está em uso!");
        await deleteDoc(doc(db, "usernames", userLogged.username));
        await setDoc(doc(db, "usernames", newUsername), { uid: auth.currentUser.uid });
    }

    await updateDoc(doc(db, "users", auth.currentUser.uid), {
        displayName: newName,
        username: newUsername,
        photo: userLogged.photo
    });
    
    userLogged.displayName = newName;
    userLogged.username = newUsername;
    alert("Perfil atualizado!");
    renderProfile();
};

// --- MENSAGEM MENU ---

window.openMsgMenu = (msgId, authorUid, text, serverId, chanId, authorName) => {
    const isMe = authorUid === auth.currentUser.uid;
    const menu = document.getElementById('msg-menu-content');
    
    menu.innerHTML = `
        <button onclick="window.replyMsg('${text}', '${authorName}')"><i class="fa-solid fa-reply"></i> Responder</button>
        <button onclick="window.viewProfile('${authorUid}')"><i class="fa-solid fa-user"></i> Ver Perfil</button>
        ${isMe ? `
            <button onclick="window.editMsgPrompt('${msgId}', '${text}', '${serverId}', '${chanId}')"><i class="fa-solid fa-pen"></i> Editar Mensagem</button>
            <button onclick="window.deleteMsgPrompt('${msgId}', '${serverId}', '${chanId}')" class="text-danger"><i class="fa-solid fa-trash"></i> Apagar Mensagem</button>
        ` : ''}
    `;
    
    document.getElementById('msg-menu').classList.remove('hidden');
    document.getElementById('overlay').classList.remove('hidden');
};

window.deleteMsgPrompt = (id, sId, cId) => {
    closeAllModals();
    const modal = document.getElementById('modal-generic');
    modal.innerHTML = `
        <div style="text-align:center">
            <i class="fa-solid fa-circle-exclamation" style="font-size:40px; color:var(--danger); margin-bottom:15px;"></i>
            <h3>Apagar Mensagem?</h3>
            <p style="color:var(--muted); margin:10px 0;">Deseja mesmo apagar essa mensagem?</p>
            <div style="display:flex; gap:10px; margin-top:20px;">
                <button class="btn-primary" style="background:#333" onclick="closeAllModals()">Cancelar</button>
                <button class="btn-danger" onclick="window.confirmDelete('${id}','${sId}','${cId}')">Sim, Apagar</button>
            </div>
        </div>
    `;
    modal.classList.remove('hidden');
    document.getElementById('overlay').classList.remove('hidden');
};

window.confirmDelete = async (id, sId, cId) => {
    await deleteDoc(doc(db, "groups", sId, "channels", cId, "messages", id));
    closeAllModals();
};

window.editMsgPrompt = (id, oldText, sId, cId) => {
    const newText = prompt("Editar mensagem:", oldText);
    if (newText && newText !== oldText) {
        updateDoc(doc(db, "groups", sId, "channels", cId, "messages", id), {
            text: newText,
            edited: true
        });
    }
    closeAllModals();
};

window.viewProfile = async (uid) => {
    const snap = await getDoc(doc(db, "users", uid));
    const u = snap.data();
    const modal = document.getElementById('modal-generic');
    modal.innerHTML = `
        <div style="text-align:center">
            <img src="${u.photo}" style="width:80px; height:80px; border-radius:50%; margin-bottom:10px; border:3px solid var(--blurple); object-fit:cover;">
            <h2>${u.displayName}</h2>
            <p style="color:var(--muted)">@${u.username}</p>
            <hr style="margin:15px 0; border:0; border-top:1px solid #333;">
            <p style="font-size:12px; color:var(--muted); margin-bottom:15px;">Membro do Tachi Chat</p>
            <button class="btn-primary" onclick="closeAllModals()">Fechar</button>
        </div>
    `;
    modal.classList.remove('hidden');
    document.getElementById('overlay').classList.remove('hidden');
};

// --- UTILITÁRIOS ---

async function getServers() {
    const q = query(collection(db, "groups"), where("members", "array-contains", auth.currentUser.uid));
    const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
    if (!snap.exists()) return [];
    const userServers = snap.data().servers || [];
    const list = [];
    for (const id of userServers) {
        const d = await getDoc(doc(db, "groups", id));
        if (d.exists()) list.push({ id: d.id, ...d.data() });
    }
    return list;
}

window.closeAllModals = () => {
    document.getElementById('overlay').classList.add('hidden');
    document.getElementById('msg-menu').classList.add('hidden');
    document.getElementById('modal-generic').classList.add('hidden');
};

handleRoute();
