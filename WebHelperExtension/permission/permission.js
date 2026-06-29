import { GoogleGenerativeAI } from "../lib/generative-ai.mjs";

// ─────────────────────────────────────────────
// CONFIGURAÇÃO DA IA
// Cole sua chave do Gemini aqui antes de testar.
// Pegue uma chave gratuita em: https://aistudio.google.com/app/apikey
// ─────────────────────────────────────────────
const API_KEY = "";
const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;

// ── REFS DO DOM ──
const viewRequest = document.getElementById("viewRequest");
const viewListen = document.getElementById("viewListen");
const btnRequestButton = document.getElementById("btnRequestPermission");
const btnDenied = document.getElementById("btnDenied");
const iconWrap = document.getElementById("iconWrap");
const statusTitle = document.getElementById("statusTitle");
const transcriptText = document.getElementById("transcriptText");
const aiStatus = document.getElementById("aiStatus");
const aiStatusLabel = document.getElementById("aiStatusLabel");
const aiStatusText = document.getElementById("aiStatusText");
const hintClose = document.getElementById("hintClose");

btnRequestButton.addEventListener("click", requestMicAndStart);

// Se a permissão já tiver sido concedida antes, pula direto pra escuta.
navigator.permissions?.query({ name: "microphone" }).then((status) => {
  if (status.state === "granted") {
    iniciarChat();
  }
}).catch(() => {
  // navegador não suporta query de permissão; mantém o botão de pedir permissão
});

async function requestMicAndStart() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    iniciarChat();
  } catch (e) {
    console.error("Permissão de microfone negada ou erro:", e);
    btnDenied.classList.add("visible");
  }
}

// ─────────────────────────────────────────────
// FALA (TEXT-TO-SPEECH) — feedback em voz alta (Mercedes/Cleber)
// ─────────────────────────────────────────────
function falar(texto, aoTerminar) {
  if (!texto || !window.speechSynthesis) {
    if (aoTerminar) aoTerminar();
    return;
  }
  window.speechSynthesis.cancel(); // não deixa falas se acumularem
  const utter = new SpeechSynthesisUtterance(texto);
  utter.lang = "pt-BR";
  utter.rate = 1;
  if (aoTerminar) {
    utter.onend = aoTerminar;
    utter.onerror = aoTerminar;
  }
  window.speechSynthesis.speak(utter);
}

// ─────────────────────────────────────────────
// RECONHECIMENTO DE VOZ
// ─────────────────────────────────────────────
let recognition = null;

function criarReconhecedor() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) return null;

  const rec = new SpeechRec();
  rec.lang = "pt-BR";
  rec.interimResults = true;
  rec.continuous = false;

  rec.onstart = () => {
    iconWrap.classList.add("pulse");
    statusTitle.textContent = "Ouvindo...";
    transcriptText.textContent = "Pode falar";
  };

  rec.onresult = (e) => {
    const interim = Array.from(e.results).map((r) => r[0].transcript).join("");
    transcriptText.textContent = interim || "Pode falar";
    if (e.results[e.results.length - 1].isFinal) {
      processarComando(interim.trim());
    }
  };

  rec.onerror = (e) => {
    iconWrap.classList.remove("pulse");
    statusTitle.textContent = "Erro no microfone";
    transcriptText.textContent = e.error;
  };

  rec.onend = () => {
    iconWrap.classList.remove("pulse");
  };

  return rec;
}

function comecarAEscutar() {
  viewRequest.style.display = "none";
  viewListen.style.display = "flex";

  recognition = criarReconhecedor();
  if (!recognition) {
    statusTitle.textContent = "Não suportado";
    transcriptText.textContent = "Reconhecimento de voz não disponível neste navegador.";
    return;
  }

  try {
    recognition.start();
  } catch (e) {
    console.error(e);
  }
}

// ─────────────────────────────────────────────
// IA (GEMINI) — chat com memória da conversa, já que agora orientamos
// passo a passo (Cleber) em vez de só responder comandos isolados.
// ─────────────────────────────────────────────
const ACOES_VALIDAS = [
  "ABRIR_SITE", "BUSCAR", "BUSCAR_NO_YOUTUBE", "NOVA_ABA", "FECHAR_ABA",
  "VOLTAR", "AVANCAR", "RECARREGAR", "ROLAR", "ZOOM"
];

const INSTRUCOES_SISTEMA = `
Você é o cérebro de uma extensão de navegador controlada por voz, usada por pessoas com diferentes níveis de familiaridade com tecnologia (desde idosos com baixa familiaridade até usuários avançados). Seja sempre simples, direto e acolhedor na "resposta_falada" - essa frase é falada em voz alta pelo computador para o usuário, então evite termos técnicos.

Responda SEMPRE e SOMENTE com um JSON válido, sem markdown, sem texto antes ou depois, em um dos três formatos abaixo:

1) Comando claro e executável:
{"tipo": "ACAO", "acao": "NOME_DA_ACAO", "param": "valor ou null", "resposta_falada": "frase curta confirmando o que você vai fazer"}

2) Comando ambíguo ou incompleto:
{"tipo": "PERGUNTA", "pergunta": "pergunta curta e direta para esclarecer", "resposta_falada": "mesma pergunta, em tom simpático"}

3) Tarefa de múltiplas etapas (ex: fazer login em um site, preencher um formulário) onde o usuário precisa de orientação antes de cada passo:
{"tipo": "ORIENTACAO", "texto": "explicação simples do próximo passo que o usuário deve fazer manualmente ou por voz", "resposta_falada": "mesma explicação, falada"}

Ações disponíveis (use exatamente esses nomes em "acao"):
- ABRIR_SITE (param: nome do site ou domínio, ex: "youtube", "github.com", "mercadolivre.com")
- BUSCAR (param: termo de busca no Google, ex: "preço de tomate hoje")
- BUSCAR_NO_YOUTUBE (param: termo de busca, ex: "receita de bolo de chocolate")
- NOVA_ABA (param: null)
- FECHAR_ABA (param: null)
- VOLTAR (param: null)
- AVANCAR (param: null)
- RECARREGAR (param: null)
- ROLAR (param: "cima", "baixo", "topo" ou "fim")
- ZOOM (param: "in", "out" ou "reset")

Regras importantes:
- Se o usuário pedir para ver/abrir/pesquisar algo no YouTube (vídeo, canal, assunto), use BUSCAR_NO_YOUTUBE, não BUSCAR.
- Se o usuário mencionar um site/serviço específico que tem login (ex: gov.br, banco, e-mail), prefira ABRIR_SITE seguido de uma ORIENTACAO no próximo turno explicando o próximo passo (ex: "agora clique em Entrar").
- Se o usuário disser algo vago como "abre aí" sem dizer o quê, use PERGUNTA.
- Mantenha o contexto da conversa: se o usuário já disse o que quer fazer antes, não pergunte de novo.

Exemplos:
Usuário: "abre o youtube" → {"tipo": "ACAO", "acao": "ABRIR_SITE", "param": "youtube", "resposta_falada": "Abrindo o YouTube para você."}
Usuário: "quero ver um vídeo de receita de bolo" → {"tipo": "ACAO", "acao": "BUSCAR_NO_YOUTUBE", "param": "receita de bolo", "resposta_falada": "Buscando vídeos de receita de bolo no YouTube."}
Usuário: "quero ver o preço da verdura no mercado" → {"tipo": "ACAO", "acao": "BUSCAR", "param": "tabela de preços hortifruti supermercado hoje", "resposta_falada": "Vou buscar os preços de hortifruti para você."}
Usuário: "abre aí" → {"tipo": "PERGUNTA", "pergunta": "O que você quer abrir?", "resposta_falada": "Desculpe, não entendi. O que você gostaria de abrir?"}
Usuário: "preciso acessar o gov.br" → {"tipo": "ACAO", "acao": "ABRIR_SITE", "param": "gov.br", "resposta_falada": "Abrindo o site do governo para você."}
`.trim();

let chatSession = null;

function iniciarChat() {
  if (!genAI) return;
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: INSTRUCOES_SISTEMA
  });
  chatSession = model.startChat({ history: [] });
  comecarAEscutar();
}

async function processarComando(texto) {
  if (!texto) return;

  iconWrap.classList.remove("pulse");
  statusTitle.textContent = "Processando...";
  transcriptText.textContent = `"${texto}"`;
  avisarSidebar({ tipo: "TRANSCRICAO", texto });

  if (!genAI || !chatSession) {
    mostrarErroNaTela("Chave da API do Gemini não configurada (permission/permission.js).");
    return;
  }

  try {
    const result = await chatSession.sendMessage(texto);
    const resposta = extrairJson(result.response.text().trim());

    if (!resposta) {
      mostrarPerguntaNaTela("Não consegui interpretar a resposta da IA. Pode repetir o comando?");
      return;
    }

    if (resposta.tipo === "PERGUNTA") {
      mostrarPerguntaNaTela(resposta.pergunta, resposta.resposta_falada);
      return;
    }

    if (resposta.tipo === "ORIENTACAO") {
      mostrarOrientacao(resposta.texto, resposta.resposta_falada);
      return;
    }

    if (resposta.tipo === "ACAO" && ACOES_VALIDAS.includes(resposta.acao)) {
      statusTitle.textContent = "Executando...";
      aiStatus.style.display = "none";

      const resultadoExecucao = await enviarParaServiceWorker(resposta.acao, resposta.param);

      if (resultadoExecucao.ok) {
        const falaConfirmacao = resposta.resposta_falada || resultadoExecucao.result?.mensagem || "Pronto.";
        statusTitle.textContent = "✓ Feito!";
        transcriptText.textContent = resultadoExecucao.result?.mensagem || "Ação executada";
        avisarSidebar({ tipo: "SUCESSO", mensagem: transcriptText.textContent });
        mostrarConfirmacaoPosAcao(falaConfirmacao);
      } else {
        mostrarErroNaTela(`Não consegui completar a ação: ${resultadoExecucao.error}`);
      }
    } else {
      mostrarPerguntaNaTela("Não tenho certeza do que fazer com esse comando. Pode explicar de outro jeito?");
    }
  } catch (err) {
    console.error(err);
    mostrarErroNaTela("Erro ao conectar com a IA. Verifique sua conexão ou a chave de API.");
  }
}

function reiniciarEscutaComDelay(delayMs = 1000) {
  setTimeout(() => {
    try {
      recognition = criarReconhecedor();
      recognition.start();
    } catch (e) {
      console.error("Não foi possível reiniciar a escuta:", e);
    }
  }, delayMs);
}

function mostrarConfirmacaoPosAcao(falaConfirmacao) {
  hintClose.textContent = "Pode falar de novo para continuar, corrigir, ou fechar esta aba quando terminar.";
  falar(falaConfirmacao, () => reiniciarEscutaComDelay(300));
}

function mostrarPerguntaNaTela(pergunta, falaCustom) {
  statusTitle.textContent = "Preciso de mais detalhes";
  transcriptText.textContent = "";
  aiStatus.style.display = "block";
  aiStatusLabel.textContent = "IA pergunta";
  aiStatusText.textContent = pergunta;
  avisarSidebar({ tipo: "PERGUNTA", pergunta });
  hintClose.textContent = "Você pode responder por voz ou fechar esta aba.";
  falar(falaCustom || pergunta, () => reiniciarEscutaComDelay(300));
}

function mostrarOrientacao(texto, falaCustom) {
  statusTitle.textContent = "Próximo passo";
  transcriptText.textContent = "";
  aiStatus.style.display = "block";
  aiStatusLabel.textContent = "Orientação";
  aiStatusText.textContent = texto;
  avisarSidebar({ tipo: "ORIENTACAO", texto });
  hintClose.textContent = "Quando fizer isso, me diga o que aconteceu ou peça o próximo passo.";
  falar(falaCustom || texto, () => reiniciarEscutaComDelay(300));
}

function mostrarErroNaTela(msg) {
  statusTitle.textContent = "Algo deu errado";
  transcriptText.textContent = "";
  aiStatus.style.display = "block";
  aiStatusLabel.textContent = "Erro";
  aiStatusText.textContent = msg;
  avisarSidebar({ tipo: "ERRO", mensagem: msg });
  falar("Desculpe, tive um problema. " + msg);
}

function extrairJson(texto) {
  let limpo = texto.replace(/```json|```/gi, "").trim();
  try {
    return JSON.parse(limpo);
  } catch (e) {
    const match = limpo.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (e2) { return null; }
    }
    return null;
  }
}

function enviarParaServiceWorker(acao, param) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "EXECUTE_ACTION", action: acao, param },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response || { ok: false, error: "Sem resposta do background" });
        }
      }
    );
  });
}

// Avisa a sidebar (se estiver aberta) sobre o que está acontecendo nesta aba.
function avisarSidebar(payload) {
  chrome.runtime.sendMessage({ type: "MIC_TAB_UPDATE", payload }, () => {
    if (chrome.runtime.lastError) { /* noop */ }
  });
}
