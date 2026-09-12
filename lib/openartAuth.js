/**
 * OpenArt Authentication & Account Verification Module
 * Đăng nhập tự động qua NextAuth Credentials API
 */

export async function loginOpenArt(email, password) {
  const cleanEmail = String(email || '').trim();
  const cleanPass = String(password || '').trim();

  if (!cleanEmail || !cleanPass) {
    throw new Error('Email và mật khẩu không được để trống');
  }

  try {
    // 1. Lấy CSRF Token và Cookie khởi tạo
    const csrfRes = await fetch('https://openart.ai/api/auth/csrf', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });

    if (!csrfRes.ok) {
      throw new Error(`Không thể lấy CSRF token từ OpenArt (${csrfRes.status})`);
    }

    const csrfData = await csrfRes.json();
    const csrfToken = csrfData.csrfToken;
    if (!csrfToken) {
      throw new Error('CSRF token không hợp lệ từ máy chủ OpenArt');
    }

    let initCookieHeader = '';
    if (csrfRes.headers.getSetCookie) {
      initCookieHeader = csrfRes.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    } else if (csrfRes.headers.get('set-cookie')) {
      initCookieHeader = csrfRes.headers.get('set-cookie').split(';')[0];
    }

    // 2. Gửi thông tin đăng nhập
    const form = new URLSearchParams();
    form.append('csrfToken', csrfToken);
    form.append('email', cleanEmail);
    form.append('password', cleanPass);
    form.append('callbackUrl', 'https://openart.ai/create');
    form.append('json', 'true');

    const authHeaders = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': 'https://openart.ai',
      'Referer': 'https://openart.ai/signin',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
    if (initCookieHeader) {
      authHeaders['Cookie'] = initCookieHeader;
    }

    const authRes = await fetch('https://openart.ai/api/auth/callback/credentials', {
      method: 'POST',
      headers: authHeaders,
      body: form.toString(),
      redirect: 'manual'
    });

    let authCookieHeader = initCookieHeader;
    let setCookieList = [];
    if (authRes.headers.getSetCookie) {
      setCookieList = authRes.headers.getSetCookie();
    } else if (authRes.headers.get('set-cookie')) {
      setCookieList = [authRes.headers.get('set-cookie')];
    }

    for (const c of setCookieList) {
      const part = c.split(';')[0];
      authCookieHeader = authCookieHeader ? `${authCookieHeader}; ${part}` : part;
    }

    // 3. Kiểm tra thông tin tài khoản qua /api/user
    const userHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
    if (authCookieHeader) userHeaders['Cookie'] = authCookieHeader;

    const userRes = await fetch('https://openart.ai/api/user', {
      headers: userHeaders,
    });

    if (!userRes.ok) {
      if (userRes.status === 401 || userRes.status === 403) {
        throw new Error('Sai tài khoản hoặc mật khẩu OpenArt');
      }
      throw new Error(`Không thể đọc thông tin người dùng (${userRes.status})`);
    }

    const userData = await userRes.json();
    
    const freeCredit = Number(userData.free_credit_balance || 0);
    const monthlyCredit = Number(userData.subscription_monthly_credit || 0);
    const trialCredit = Number(userData.trial_credit_balance || 0);
    const dalleCredit = Number(userData.dalle2_credit_balance || 0);
    const totalCredits = freeCredit + monthlyCredit + trialCredit;

    return {
      success: true,
      email: cleanEmail,
      userId: userData.id || '',
      username: userData.username || userData.displayName || cleanEmail.split('@')[0],
      isSubscribed: !!userData.subscription_active,
      subscriptionType: userData.subscription_type || 'Free',
      credits: totalCredits,
      creditDetails: {
        free: freeCredit,
        monthly: monthlyCredit,
        trial: trialCredit,
        dalle: dalleCredit,
      },
      cookies: authCookieHeader,
      lastChecked: new Date().toISOString(),
    };
  } catch (err) {
    return {
      success: false,
      email: cleanEmail,
      error: err.message || 'Lỗi không xác định khi kết nối OpenArt',
      lastChecked: new Date().toISOString(),
    };
  }
}

export async function refreshOpenArtCredits(cookies) {
  try {
    const userRes = await fetch('https://openart.ai/api/user', {
      headers: {
        'Cookie': cookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!userRes.ok) {
      throw new Error(`Lỗi session (${userRes.status})`);
    }

    const userData = await userRes.json();
    const freeCredit = Number(userData.free_credit_balance || 0);
    const monthlyCredit = Number(userData.subscription_monthly_credit || 0);
    const trialCredit = Number(userData.trial_credit_balance || 0);
    const totalCredits = freeCredit + monthlyCredit + trialCredit;

    return {
      success: true,
      credits: totalCredits,
      isSubscribed: !!userData.subscription_active,
      creditDetails: {
        free: freeCredit,
        monthly: monthlyCredit,
        trial: trialCredit,
      }
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}
