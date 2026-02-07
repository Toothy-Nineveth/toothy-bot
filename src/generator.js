const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../inventory.json');
const HTML_FILE = path.join(__dirname, '../public/index.html');

// Template for the HTML file
const generateHTML = (items) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>D&D Inventory</title>
    <style>
        :root {
            --bg-color: #1a1a1a;
            --card-bg: #2d2d2d;
            --text-color: #e0e0e0;
            --accent-color: #976bffff;
        }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-color);
            margin: 0;
            padding: 20px;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .search-container {
            max-width: 600px;
            margin: 0 auto 30px;
            text-align: center;
        }
        input[type="text"] {
            width: 100%;
            padding: 12px;
            font-size: 16px;
            border: none;
            border-radius: 8px;
            background-color: var(--card-bg);
            color: var(--text-color);
            border: 2px solid #444;
        }
        input[type="text"]:focus {
            outline: none;
            border-color: var(--accent-color);
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 20px;
            padding: 20px;
        }
        .card {
            background-color: var(--card-bg);
            border-radius: 12px;
            overflow: hidden;
            transition: transform 0.2s;
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        }
        .card:hover {
            transform: translateY(-5px);
        }
        .card img {
            width: 100%;
            height: 250px;
            object-fit: cover;
            cursor: pointer;
        }
        .card-content {
            padding: 15px;
        }
        .card-title {
            font-size: 1.1em;
            font-weight: bold;
            margin-bottom: 5px;
            color: var(--accent-color);
        }
        .card-meta {
            font-size: 0.9em;
            color: #aaa;
            margin-bottom: 10px;
        }
        .card-desc {
            font-size: 0.95em;
            line-height: 1.4;
        }
        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.9);
            justify-content: center;
            align-items: center;
        }
        .modal img {
            max-width: 90%;
            max-height: 90%;
            border-radius: 8px;
        }
        .close {
            position: absolute;
            top: 20px;
            right: 35px;
            color: #f1f1f1;
            font-size: 40px;
            font-weight: bold;
            cursor: pointer;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Party Inventory</h1>
    </div>

    <div class="search-container">
        <input type="text" id="searchInput" placeholder="Search items by name, description, or sender...">
    </div>

    <div class="grid" id="inventoryGrid">
        ${items.map(item => `
            <div class="card" data-search="${(item.filename + ' ' + item.content + ' ' + item.sender).toLowerCase()}">
                <img src="${item.localPath}" alt="${item.filename}" onclick="openModal('${item.localPath}')">
                <div class="card-content">
                    <div class="card-title">${item.filename}</div>
                    <div class="card-meta">
                        Dropped by ${item.sender}<br>
                        ${new Date(item.timestamp).toLocaleDateString()}
                    </div>
                    <div class="card-desc">${item.content || 'No description provided.'}</div>
                </div>
            </div>
        `).join('')}
    </div>

    <div id="imageModal" class="modal" onclick="closeModal()">
        <span class="close">&times;</span>
        <img id="modalImg">
    </div>

    <script>
        const searchInput = document.getElementById('searchInput');
        const grid = document.getElementById('inventoryGrid');
        const cards = document.querySelectorAll('.card');

        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            cards.forEach(card => {
                const searchData = card.getAttribute('data-search');
                if (searchData.includes(term)) {
                    card.style.display = 'block';
                } else {
                    card.style.display = 'none';
                }
            });
        });

        function openModal(src) {
            const modal = document.getElementById('imageModal');
            const modalImg = document.getElementById('modalImg');
            modal.style.display = "flex";
            modalImg.src = src;
        }

        function closeModal() {
            document.getElementById('imageModal').style.display = "none";
        }
    </script>
</body>
</html>
`;

async function updateInventory(newItem) {
    let items = [];

    // Read existing
    if (fs.existsSync(DATA_FILE)) {
        try {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            items = JSON.parse(data);
        } catch (e) {
            console.error('Error reading inventory.json, starting fresh.', e);
        }
    }

    // Add new item (prepend to show newest first)
    items.unshift(newItem);

    // Save back to JSON
    fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2));

    // Regenerate HTML
    const html = generateHTML(items);
    fs.writeFileSync(HTML_FILE, html);

    console.log('Inventory updated and HTML regenerated.');
}

module.exports = { updateInventory };
