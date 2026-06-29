chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[service-worker] mensagem recebida:", message);

  if (message.type === "OPEN_MIC") {
    chrome.tabs.create({
      url: chrome.runtime.getURL("permission/permission.html"),
      active: true
    });
    return;
  }

  if (message.type === "EXECUTE_ACTION") {
    executeAction(message.action, message.param)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // mantém o canal aberto para resposta assíncrona
  }

  if (message.type === "MIC_TAB_UPDATE") {
    // Mensagem informativa da aba de escuta -> a sidebar já escuta isso
    // diretamente via chrome.runtime.onMessage; aqui só logamos para debug.
    console.log("[service-worker] update da aba de mic:", message.payload);
    return;
  }
});

/**
 * Executa uma ação de navegador com base na decisão da IA.
 * action: string do tipo de ação (ver lista abaixo)
 * param: argumento da ação, quando necessário (ex: url, termo de busca, quantidade de scroll)
 */
async function executeAction(action, param) {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  switch (action) {

    case "ABRIR_SITE": {
      const url = normalizarUrl(param);
      const novaAba = await chrome.tabs.create({ url, active: true });
      return { mensagem: `Abrindo ${url}`, tabId: novaAba.id };
    }

    case "BUSCAR": {
      const url = `https://www.google.com/search?q=${encodeURIComponent(param)}`;
      const novaAba = await chrome.tabs.create({ url, active: true });
      return { mensagem: `Buscando por "${param}"`, tabId: novaAba.id };
    }

    case "NOVA_ABA": {
      const novaAba = await chrome.tabs.create({ active: true });
      return { mensagem: "Nova aba aberta", tabId: novaAba.id };
    }

    case "FECHAR_ABA": {
      if (!activeTab) throw new Error("Nenhuma aba ativa encontrada");
      await chrome.tabs.remove(activeTab.id);
      return { mensagem: "Aba fechada" };
    }

    case "VOLTAR": {
      if (!activeTab) throw new Error("Nenhuma aba ativa encontrada");
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: () => window.history.back()
      });
      return { mensagem: "Voltando à página anterior" };
    }

    case "AVANCAR": {
      if (!activeTab) throw new Error("Nenhuma aba ativa encontrada");
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: () => window.history.forward()
      });
      return { mensagem: "Avançando para a próxima página" };
    }

    case "RECARREGAR": {
      if (!activeTab) throw new Error("Nenhuma aba ativa encontrada");
      await chrome.tabs.reload(activeTab.id);
      return { mensagem: "Página recarregada" };
    }

    case "ROLAR": {
      if (!activeTab) throw new Error("Nenhuma aba ativa encontrada");
      // param esperado: "baixo", "cima", "topo", "fim"
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: (direcao) => {
          if (direcao === "topo") {
            window.scrollTo({ top: 0, behavior: "smooth" });
          } else if (direcao === "fim") {
            window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
          } else if (direcao === "cima") {
            window.scrollBy({ top: -500, behavior: "smooth" });
          } else {
            window.scrollBy({ top: 500, behavior: "smooth" });
          }
        },
        args: [param]
      });
      return { mensagem: `Rolando a página (${param})` };
    }

    case "ZOOM": {
      if (!activeTab) throw new Error("Nenhuma aba ativa encontrada");
      // param esperado: "in", "out" ou "reset"
      const atual = await chrome.tabs.getZoom(activeTab.id);
      let novoZoom = atual;
      if (param === "in") novoZoom = Math.min(atual + 0.25, 3);
      else if (param === "out") novoZoom = Math.max(atual - 0.25, 0.25);
      else novoZoom = 1;
      await chrome.tabs.setZoom(activeTab.id, novoZoom);
      return { mensagem: `Zoom ajustado para ${Math.round(novoZoom * 100)}%` };
    }

    default:
      throw new Error(`Ação desconhecida: ${action}`);
  }
}

function normalizarUrl(texto) {
  if (!texto) return "https://www.google.com";
  let url = texto.trim();

  // Se já parece uma URL completa, usa direto
  if (/^https?:\/\//i.test(url)) return url;

  // Atalhos comuns de sites conhecidos (facilita comandos de voz tipo "abre o youtube")
  const atalhos = {
    "youtube": "youtube.com",
    "google": "google.com",
    "gmail": "mail.google.com",
    "github": "github.com",
    "whatsapp": "web.whatsapp.com",
    "instagram": "instagram.com",
    "facebook": "facebook.com",
    "twitter": "twitter.com",
    "x": "x.com"
  };

  const chave = url.toLowerCase().replace(/\s+/g, "");
  if (atalhos[chave]) {
    url = atalhos[chave];
  }

  // Se não tem ponto (não parece domínio), trata como busca no Google
  if (!url.includes(".")) {
    return `https://www.google.com/search?q=${encodeURIComponent(url)}`;
  }

  return `https://${url}`;
}
