chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: true})
.catch((error) => console.error(error))

chrome.runtime.onMessage.addListener((message,sender,senderResponse) =>{
    console.log("abriu")

    if(message.type === "OPEN_MIC"){
        chrome.tabs.create({
            url: chrome.runtime.getURL('permission/permission.html'),
            active: true
        });
    }
})