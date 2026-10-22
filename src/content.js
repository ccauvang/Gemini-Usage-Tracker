// temp ui preview, remove when real logic lands
const timer = setInterval(() => {
    const anchor = document.querySelector('expandable-section[storagekey="notebooks"]')
    if (!anchor) return
    clearInterval(timer)
    anchor.after(GUT.ui.build())
    GUT.ui.render({
        tier: 'Pro',
        session: { percent: 59, reset: '3h 53m' },
        weekly: { percent: 14, reset: '1d 8h' }
    })
}, 500)