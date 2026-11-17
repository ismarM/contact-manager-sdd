package si.contactmanager.apikey;

/**
 * Izid zahteve s ključem za statistiko (019, FR-019-20, research R-06): uspešno branje (2xx + GET), uspešno pisanje
 * (2xx + druga metoda), zavrnitev zaradi omejitve pogostosti (429) in napaka (vse ostalo: 4xx, 5xx).
 */
enum UsageOutcome {
    READ_OK,
    WRITE_OK,
    ERROR,
    RATE_LIMITED;

    static UsageOutcome of(String method, int status) {
        if (status == 429) {
            return RATE_LIMITED;
        }
        if (status >= 200 && status < 300) {
            return "GET".equalsIgnoreCase(method) ? READ_OK : WRITE_OK;
        }
        return ERROR;
    }
}
