// --- CẤU HÌNH CƠ SỞ DỮ LIỆU INDEXEDDB ---
const DB_NAME = 'TuoiTreRealtimeDB';
const DB_VERSION = 3;
let db;

// Dữ liệu mồi ban đầu (Đã chuẩn hóa timestamp về dạng số nguyên để tính time-ago)
const INITIAL_ARTICLES = [
    { id: 1, category: 'Thời Sự', title: 'Đề nghị các nước tôn trọng chủ quyền của Việt Nam ở quần đảo Hoàng Sa', summary: 'Việt Nam có đầy đủ chứng cứ lịch sử và cơ sở pháp lý để khẳng định chủ quyền của mình.', content: 'Tại cuộc họp báo, Bộ Ngoại giao khẳng định mọi hoạt động tại Hoàng Sa không có sự cho phép của Việt Nam là vi phạm chủ quyền.', image: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=600&q=80', timestamp: Date.now() - 900000, views: 5400 },
    { id: 2, category: 'Kinh Doanh', title: 'Giá xăng dầu đồng loạt giảm mạnh từ chiều nay', summary: 'Liên Bộ Công Thương - Tài chính điều chỉnh giảm giá bán lẻ đồng loạt các mặt hàng.', content: 'Xăng RON 95 giảm sâu giúp giảm bớt chi phí vận chuyển nặng nề của các doanh nghiệp và áp lực thị trường.', image: 'https://images.unsplash.com/photo-1535732820275-9ffd99922227?auto=format&fit=crop&w=600&q=80', timestamp: Date.now() - 7200000, views: 4100 },
    { id: 3, category: 'Video', title: 'Toàn cảnh hiện trường xử lý điểm sạt lở đèo bảo lộc bằng flycam', summary: 'Đoạn video clip thực tế ghi nhận nỗ lực giải phóng thông tuyến của các lực lượng cứu hộ đêm qua.', content: 'Khối lượng đất đá khổng lồ đã được dọn dẹp cơ bản, dự kiến giao thông sẽ hoạt động bình thường vào sáng mai.', image: 'https://images.unsplash.com/photo-1473968512647-3e447244af8f?auto=format&fit=crop&w=600&q=80', timestamp: Date.now() - 2700000, views: 6200 },
    { id: 4, category: 'Khoa Học', title: 'Kính viễn vọng không gian phát hiện hành tinh mới có bầu khí quyển', summary: 'Các nhà khoa học nhận định đây là bước tiến lớn trong hành trình tìm kiếm sự sống ngoài vũ trụ.', content: 'Hành tinh mới cách trái đất khoảng 40 năm ánh sáng, có các dấu hiệu hơi nước rất rõ nét trong tầng khí quyển bên ngoài.', image: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=600&q=80', timestamp: Date.now() - 3600000, views: 1800 },
    { id: 5, category: 'Bạn Đọc', title: 'Đường dây nóng phản ánh tình trạng ngập úng đô thị khi vào mùa mưa', summary: 'Hàng loạt ý kiến gửi về tòa soạn đề xuất giải pháp cải tạo hệ thống thoát nước cộng đồng.', content: 'Người dân mong muốn chính quyền sớm nạo vét các kênh mương bị tắc nghẽn trước khi đỉnh điểm mùa mưa bão tới.', image: 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&w=600&q=80', timestamp: Date.now() - 10800000, views: 1450 }
];

let currentActiveCategory = 'Mới Nhất';
let currentViewingArticleId = null; // Lưu ID bài viết đang xem chi tiết để render real-time view

// KHỞI TẠO CƠ SỞ DỮ LIỆU CHUẨN
function initDatabase() {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = function(e) {
        const dbInstance = e.target.result;
        if (!dbInstance.objectStoreNames.contains('users')) {
            dbInstance.createObjectStore('users', { keyPath: 'username' });
        }
        if (!dbInstance.objectStoreNames.contains('articles')) {
            dbInstance.createObjectStore('articles', { keyPath: 'id', autoIncrement: true });
        }
    };
    
    request.onsuccess = function(e) {
        db = e.target.result;
        const txUser = db.transaction(['users'], 'readwrite');
        txUser.objectStore('users').put({ username: 'admin', password: '123456', fullName: 'Ban Biên Tập' });
        
        const txArt = db.transaction(['articles'], 'readwrite');
        const store = txArt.objectStore('articles');
        const countReq = store.count();
        
        countReq.onsuccess = function() {
            if (countReq.result === 0) {
                INITIAL_ARTICLES.forEach(art => store.add(art));
            }
            refreshUI(); // Hàm trung gian gom tải luồng tin và sidebar
            initRealTimeSimulation(); // Kích hoạt bộ giả lập tăng view real-time
        };
    };
}

// --- THÊM MỚI: HÀM TÍNH THỜI GIAN THỰC (TIME-AGO) ---
function formatTimeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'Vừa xong';
    
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes} phút trước`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} giờ trước`;
    
    const days = Math.floor(hours / 24);
    return `${days} ngày trước`;
}

// --- THÊM MỚI: HÀM GIẢ LẬP TĂNG VIEW THEO THỜI GIAN THỰC ---
function initRealTimeSimulation() {
    // Cứ mỗi 3 giây, tự động chọn ngẫu nhiên bài viết để tăng lượt xem (từ 1 đến 5 views tự nhiên)
    setInterval(() => {
        if (!db) return;
        const transaction = db.transaction(['articles'], 'readwrite');
        const store = transaction.objectStore('articles');
        
        store.getAll().onsuccess = function(e) {
            const articles = e.target.result;
            if (articles.length === 0) return;
            
            // Chọn ngẫu nhiên 1 đến 2 bài viết để tăng tương tác ngầm
            const randomIndex = Math.floor(Math.random() * articles.length);
            const targetArticle = articles[randomIndex];
            
            targetArticle.views = (targetArticle.views || 0) + Math.floor(Math.random() * 5) + 1;
            
            store.put(targetArticle).onsuccess = function() {
                // Sau khi cập nhật DB thành công, render lại giao diện tức thì không cần F5
                refreshUI();
                // Nếu người dùng đang xem bài viết vừa được tăng view đó, cập nhật luôn số view tại bài chi tiết
                if (currentViewingArticleId === targetArticle.id) {
                    updateDetailViewsOnly(targetArticle.views);
                }
            };
        };
    }, 3000);

    // Cứ mỗi 30 giây làm mới lại thời lượng (X phút trước) toàn trang để giờ giấc luôn chuẩn xác
    setInterval(() => {
        refreshUI();
    }, 30000);
}

// Hàm gom nhóm làm mới giao diện 
function refreshUI() {
    const isDetailHidden = document.getElementById('article-detail').classList.contains('hidden');
    if (isDetailHidden) {
        switchTab(currentActiveCategory, false); // Tải lại danh sách tab hiện tại (không cuộn top)
    }
    loadSidebars();
}

// Cập nhật nhanh số view trong trang chi tiết mà không gây giật lag hoặc mất dấu cuộn chuột
function updateDetailViewsOnly(newViews) {
    const viewCountEl = document.getElementById('realtime-view-count');
    if (viewCountEl) {
        viewCountEl.innerText = newViews;
    }
}

// ĐIỀU KHIỂN MEGA MENU TẤT CẢ CHUYÊN MỤC
function toggleMegaMenu(forcedState) {
    const mega = document.getElementById('mega-menu');
    const isHidden = mega.classList.contains('hidden');
    const show = (forcedState !== undefined) ? forcedState : isHidden;
    
    if (show) {
        mega.classList.remove('hidden');
        setTimeout(() => { mega.classList.remove('opacity-0'); }, 10);
    } else {
        mega.classList.add('opacity-0');
        setTimeout(() => { mega.classList.add('hidden'); }, 200);
    }
}

function selectMegaCategory(category) {
    toggleMegaMenu(false);
    switchTab(category);
}

// ĐỔ LUỒNG DỮ LIỆU RA BẢNG TIN
function getAllArticlesFromDB(callback) {
    const transaction = db.transaction(['articles'], 'readonly');
    const store = transaction.objectStore('articles');
    const request = store.getAll();
    request.onsuccess = function() {
        const sorted = request.result.sort((a, b) => b.timestamp - a.timestamp);
        callback(sorted);
    };
}

function switchTab(categoryName, shouldScrollTop = true) {
    currentActiveCategory = categoryName;
    const buttons = document.querySelectorAll('#nav-tabs .nav-link');
    buttons.forEach(btn => {
        if (btn.innerText.trim() === categoryName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Nếu quay về danh sách, xóa ID bài viết đang xem chi tiết
    if (shouldScrollTop) {
        document.getElementById('main-content').classList.remove('hidden');
        document.getElementById('article-detail').classList.add('hidden');
        currentViewingArticleId = null; 
    }

    checkPublishBoxVisibility();

    getAllArticlesFromDB(function(allArticles) {
        let filtered = [];
        if (categoryName === 'Mới Nhất') {
            filtered = allArticles;
        } else if (categoryName === 'Xem Nhiều') {
            filtered = [...allArticles].sort((a,b) => b.views - a.views);
        } else {
            filtered = allArticles.filter(a => a.category.toLowerCase() === categoryName.toLowerCase());
        }

        const mainContent = document.getElementById('main-content');
        if (filtered.length === 0) {
            mainContent.innerHTML = `<p class="text-gray-500 py-12 text-center bg-white rounded border text-xs">Chưa có bài viết mới nào thuộc danh mục ${categoryName}.</p>`;
            return;
        }

        let html = '';
        filtered.forEach((article, index) => {
            // Sử dụng hàm formatTimeAgo(article.timestamp) thay cho trường văn bản tĩnh cũ
            const timeAgo = formatTimeAgo(article.timestamp);

            if (index === 0 && categoryName !== 'Xem Nhiều') {
                html += `
                    <article onclick="viewArticle(${article.id})" class="bg-white rounded overflow-hidden border border-gray-200 shadow-sm group cursor-pointer">
                        <div class="overflow-hidden relative">
                            <img src="${article.image}" class="w-full h-72 object-cover group-hover:scale-105 transition-transform duration-300">
                            <span class="absolute top-2 left-2 bg-[#ce0000] text-white text-[10px] font-bold px-2 py-0.5 rounded-sm">${article.category.toUpperCase()}</span>
                        </div>
                        <div class="p-4">
                            <h2 class="font-bold text-xl group-hover:text-blue-700 mb-2 leading-snug">${article.title}</h2>
                            <p class="text-gray-600 text-xs line-clamp-2 mb-2">${article.summary}</p>
                            <div class="text-[11px] text-gray-400"><i class="fa-regular fa-clock mr-1"></i> Đăng: ${timeAgo} | Lượt xem: ${article.views}</div>
                        </div>
                    </article>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                `;
            } else {
                html += `
                    <div onclick="viewArticle(${article.id})" class="news-card">
                        <img src="${article.image}" class="w-24 h-24 object-cover rounded flex-shrink-0 bg-gray-100">
                        <div class="flex flex-col justify-between w-full">
                            <h3 class="font-bold text-xs text-gray-800 hover:text-blue-700 line-clamp-2 leading-tight">${article.title}</h3>
                            <p class="text-[11px] text-gray-500 line-clamp-2 hidden sm:block">${article.summary}</p>
                            <span class="text-[10px] text-gray-400">
                                <span class="text-blue-600 font-semibold">[${article.category}]</span> 
                                <i class="fa-regular fa-clock"></i> ${timeAgo} | <i class="fa-regular fa-eye"></i> ${article.views}
                            </span>
                        </div>
                    </div>
                `;
            }
        });
        if (categoryName !== 'Xem Nhiều') html += `</div>`;
        mainContent.innerHTML = html;
        
        if (shouldScrollTop) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
}

// XỬ LÝ ĐĂNG BÀI
const publishForm = document.getElementById('publish-form');
publishForm.addEventListener('submit', function(e) {
    e.preventDefault();
    
    const sessionData = sessionStorage.getItem('currentUser');
    if (!sessionData) { alert('Vui lòng đăng nhập tài khoản quản trị!'); return; }
    
    const user = JSON.parse(sessionData);
    if (user.role !== 'admin') { 
        alert('Tài khoản của bạn chỉ được quyền xem! Không được phép đăng bài viết.'); 
        return; 
    }
    
    const category = document.getElementById('pub-category').value;
    const title = document.getElementById('pub-title').value.trim();
    const summary = document.getElementById('pub-summary').value.trim();
    const content = document.getElementById('pub-content').value.trim();
    let image = document.getElementById('pub-image').value.trim();

    if(!image) image = 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=600&q=80';

    const newArticle = {
        category: category,
        title: title,
        summary: summary,
        content: content,
        image: image,
        timestamp: Date.now(), // Ghi nhận thời gian máy chủ client chính xác từng mili-giây
        views: 1
    };

    const transaction = db.transaction(['articles'], 'readwrite');
    const store = transaction.objectStore('articles');
    store.add(newArticle).onsuccess = function() {
        publishForm.reset();
        switchTab(category);
        loadSidebars();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
});

// XEM BÀI VIẾT CHI TIẾT
function viewArticle(id) {
    currentViewingArticleId = id; // Định danh bài viết đang hiển thị trên màn hình lớn
    const transaction = db.transaction(['articles'], 'readwrite');
    const store = transaction.objectStore('articles');
    
    store.get(id).onsuccess = function(e) {
        const article = e.target.result;
        if (!article) return;

        article.views = (article.views || 0) + 1; // Click vào xem tăng 1 view cố định
        store.put(article);

        document.getElementById('main-content').classList.add('hidden');
        document.getElementById('admin-publish-box').classList.add('hidden');
        const detailZone = document.getElementById('article-detail');
        detailZone.classList.remove('hidden');

        const timeAgo = formatTimeAgo(article.timestamp);

        detailZone.innerHTML = `
            <button onclick="switchTab('${currentActiveCategory}')" class="text-xs text-blue-600 hover:underline mb-4 inline-block font-semibold">
                <i class="fa-solid fa-arrow-left mr-1"></i> Quay lại danh sách
            </button>
            <span class="block text-xs font-bold text-[#ce0000] uppercase mb-1">${article.category}</span>
            <h1 class="text-2xl font-bold text-gray-900 mb-3 leading-tight">${article.title}</h1>
            <div class="text-[11px] text-gray-400 mb-4 pb-2 border-b">
                <i class="fa-regular fa-clock mr-1"></i> Đăng: ${timeAgo} | 
                <i class="fa-regular fa-eye mr-1"></i> Lượt xem: <span id="realtime-view-count" class="font-bold text-blue-600 bg-blue-50 px-1 py-0.5 rounded">${article.views}</span>
            </div>
            <p class="font-bold text-gray-700 mb-4 text-sm leading-relaxed bg-gray-50 p-3 border-l-4 border-gray-400">${article.summary}</p>
            <img src="${article.image}" class="w-full h-auto max-h-96 object-cover rounded mb-5">
            <div class="text-gray-800 text-sm leading-7 space-y-4 whitespace-pre-line">${article.content}</div>
        `;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
}

// TÌM KIẾM TIN TỨC
function handleSearch() {
    const searchInput = document.getElementById('search-input');
    const keyword = searchInput.value.trim().toLowerCase();
    if (keyword === "") { switchTab('Mới Nhất'); return; }

    document.getElementById('main-content').classList.remove('hidden');
    document.getElementById('article-detail').classList.add('hidden');
    currentViewingArticleId = null;
    document.querySelectorAll('#nav-tabs .nav-link').forEach(btn => btn.classList.remove('active'));

    getAllArticlesFromDB(function(allArticles) {
        const matched = allArticles.filter(art => art.title.toLowerCase().includes(keyword) || art.summary.toLowerCase().includes(keyword));
        const mainContent = document.getElementById('main-content');
        if (matched.length === 0) {
            mainContent.innerHTML = `<div class="text-center py-12 bg-white rounded border text-gray-500 text-sm">Không tìm thấy kết quả phù hợp</div>`;
            return;
        }
        let html = `<h2 class="text-xs font-bold text-gray-600 mb-3 uppercase tracking-wider">Kết quả: "${searchInput.value}"</h2><div class="grid grid-cols-1 gap-3">`;
        matched.forEach(article => {
            const timeAgo = formatTimeAgo(article.timestamp);
            html += `
                <div onclick="viewArticle(${article.id})" class="news-card">
                    <img src="${article.image}" class="w-20 h-20 object-cover rounded flex-shrink-0">
                    <div class="flex flex-col justify-between">
                        <h3 class="font-bold text-xs hover:text-blue-700">${article.title}</h3>
                        <span class="text-[10px] text-gray-400">${timeAgo} | Mục: ${article.category} | Lượt xem: ${article.views}</span>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
        mainContent.innerHTML = html;
    });
}

// TẢI SIDEBAR TIN MỚI & XU HƯỚNG
function loadSidebars() {
    getAllArticlesFromDB(function(allArticles) {
        const leftZone = document.getElementById('sidebar-left-news');
        let leftHtml = '';
        allArticles.slice(0, 5).forEach(art => {
            const timeAgo = formatTimeAgo(art.timestamp);
            leftHtml += `
                <div class="py-2 cursor-pointer group" onclick="viewArticle(${art.id})">
                    <h4 class="text-xs font-bold text-gray-800 group-hover:text-blue-700 line-clamp-2 leading-tight">${art.title}</h4>
                    <span class="text-[10px] text-gray-400">${timeAgo} | <i class="fa-regular fa-eye text-[9px]"></i> ${art.views}</span>
                </div>
            `;
        });
        leftZone.innerHTML = leftHtml;

        const rightZone = document.getElementById('sidebar-right-trending');
        const trending = [...allArticles].sort((a,b) => b.views - a.views).slice(0, 5);
        let rightHtml = '';
        trending.forEach((art, idx) => {
            rightHtml += `
                <li class="flex space-x-3 cursor-pointer group" onclick="viewArticle(${art.id})">
                    <span class="font-extrabold text-lg text-gray-300 group-hover:text-[#ce0000]">0${idx+1}</span>
                    <div class="w-full">
                        <p class="text-xs text-gray-700 group-hover:text-blue-700 line-clamp-2 font-medium leading-tight">${art.title}</p>
                        <span class="text-[9px] text-gray-400 font-normal"><i class="fa-solid fa-fire text-orange-500 mr-0.5"></i> ${art.views} lượt xem</span>
                    </div>
                </li>
            `;
        });
        rightZone.innerHTML = rightHtml;
    });
}

// --- HỆ THỐNG XỬ LÝ AUTHENTICATION VÀ PHÂN QUYỀN TRUY CẬP ---
const loginModal = document.getElementById('login-modal');
const modalBox = document.getElementById('modal-box');
const authAlert = document.getElementById('auth-alert');
const authAlertText = document.getElementById('auth-alert-text');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authZone = document.getElementById('auth-zone');

function switchAuthMode(mode) {
    showAlert('', '', false);
    loginForm.reset(); registerForm.reset();
    const loginTab = document.getElementById('tab-login-btn');
    const regTab = document.getElementById('tab-register-btn');
    if (mode === 'login') {
        loginForm.classList.remove('hidden'); registerForm.classList.add('hidden');
        loginTab.className = "w-1/2 pb-2 text-center border-b-2 border-[#ce0000] text-[#ce0000]";
        regTab.className = "w-1/2 pb-2 text-center border-b-2 border-transparent text-gray-400 hover:text-gray-600";
    } else {
        loginForm.classList.add('hidden'); registerForm.classList.remove('hidden');
        loginTab.className = "w-1/2 pb-2 text-center border-b-2 border-transparent text-gray-400 hover:text-gray-600";
        regTab.className = "w-1/2 pb-2 text-center border-b-2 border-blue-600 text-blue-600";
    }
}

function showAlert(message, type = 'error', show = true) {
    if (!show) { authAlert.classList.add('hidden'); return; }
    authAlert.classList.remove('hidden', 'bg-red-50', 'text-red-600', 'bg-green-50', 'text-green-600');
    if (type === 'error') {
        authAlert.classList.add('bg-red-50', 'text-red-600');
        authAlert.querySelector('.id-icon').className = "fa-solid fa-circle-exclamation id-icon";
    } else {
        authAlert.classList.add('bg-green-50', 'text-green-600');
        authAlert.querySelector('.id-icon').className = "fa-solid fa-circle-check id-icon";
    }
    authAlertText.innerText = message;
}

function toggleModal(show) {
    if (show) {
        loginModal.classList.remove('hidden');
        setTimeout(() => { loginModal.classList.remove('opacity-0'); modalBox.classList.remove('scale-95'); }, 10);
    } else {
        loginModal.classList.add('opacity-0'); modalBox.scale95;
        showAlert('', '', false); switchAuthMode('login');
        setTimeout(() => { loginModal.classList.add('hidden'); }, 300);
    }
}

loginForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const userInp = document.getElementById('username').value.trim().toLowerCase();
    const passInp = document.getElementById('password').value;
    
    const transaction = db.transaction(['users'], 'readonly');
    transaction.objectStore('users').get(userInp).onsuccess = function(e) {
        const userData = e.target.result;
        if (userData && userData.password === passInp) {
            const role = (userInp === 'admin') ? 'admin' : 'member';
            sessionStorage.setItem('currentUser', JSON.stringify({ name: userData.fullName, role: role }));
            toggleModal(false);
            checkLoginSession();
        } else {
            showAlert('Tài khoản hoặc mật khẩu chưa chính xác!');
        }
    };
});

registerForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const fullName = document.getElementById('reg-fullname').value.trim();
    const username = document.getElementById('reg-username').value.trim().toLowerCase();
    const password = document.getElementById('reg-password').value;

    if (username === 'admin') { showAlert('Không thể đăng ký trùng tên với quản trị tối cao!'); return; }
    if (password.length < 6) { showAlert('Mật khẩu tối thiểu cần 6 ký tự!'); return; }

    const transactionCheck = db.transaction(['users'], 'readonly');
    transactionCheck.objectStore('users').get(username).onsuccess = function(e) {
        if (e.target.result) {
            showAlert('Tên tài khoản này đã tồn tại!');
        } else {
            const transactionWrite = db.transaction(['users'], 'readwrite');
            transactionWrite.objectStore('users').put({ username: username, password: password, fullName: fullName }).onsuccess = function() {
                showAlert('Đăng ký thành công tài khoản Người xem!', 'success');
                setTimeout(() => { switchAuthMode('login'); document.getElementById('username').value = username; }, 1000);
            };
        }
    };
});

function handleLogout() { 
    sessionStorage.removeItem('currentUser'); 
    checkLoginSession(); 
}

function checkLoginSession() {
    const sessionData = sessionStorage.getItem('currentUser');
    if (sessionData) {
        const user = JSON.parse(sessionData);
        authZone.innerHTML = `
            <div class="flex items-center space-x-1.5 bg-gray-100 p-1 pr-2 rounded border border-gray-200">
                <div class="w-5 h-5 rounded-sm ${user.role === 'admin' ? 'bg-red-600' : 'bg-blue-600'} text-white flex items-center justify-center font-bold text-[10px] uppercase">${user.name.charAt(0)}</div>
                <span class="text-[10px] font-bold text-gray-700 max-w-[70px] truncate">${user.name}</span>
                <button onclick="handleLogout()" class="text-gray-400 hover:text-red-500 transition-colors ml-1"><i class="fa-solid fa-right-from-bracket text-[10px]"></i></button>
            </div>`;
    } else {
        authZone.innerHTML = `<button onclick="toggleModal(true)" class="bg-[#0066cc] hover:bg-[#0052a3] text-white text-[11px] font-bold px-3 py-1.5 rounded transition-all uppercase tracking-wide"><i class="fa-solid fa-user mr-1"></i> Đăng nhập</button>`;
    }
    checkPublishBoxVisibility();
}

function checkPublishBoxVisibility() {
    const adminPublishBox = document.getElementById('admin-publish-box');
    if (!adminPublishBox) return;

    const sessionData = sessionStorage.getItem('currentUser');
    const isDetailHidden = document.getElementById('article-detail').classList.contains('hidden');

    if (sessionData) {
        const user = JSON.parse(sessionData);
        if (user.role === 'admin' && isDetailHidden) {
            adminPublishBox.classList.remove('hidden');
            return;
        }
    }
    adminPublishBox.classList.add('hidden');
}

// --- HỆ THỐNG CẬP NHẬT THỜI GIAN THỰC VIỆT NAM ---
function updateRealTimeClock() {
    const dateElement = document.getElementById('current-date');
    if (!dateElement) return;

    const now = new Date();
    const daysOfWeek = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
    const dayName = daysOfWeek[now.getDay()];

    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();

    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    dateElement.innerHTML = `${dayName}, ngày ${day}-${month}-${year} | ${hours}:${minutes}:${seconds}`;
}

document.getElementById('search-input').addEventListener('keypress', function(e) { if (e.key === 'Enter') handleSearch(); });

// KHỞI CHẠY HỆ THỐNG
document.addEventListener('DOMContentLoaded', () => {
    initDatabase();
    checkLoginSession();
    updateRealTimeClock();
    setInterval(updateRealTimeClock, 1000);
});
