package si.contactmanager.account;

import java.time.LocalDate;
import java.time.ZoneOffset;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Izvoz mojih podatkov (012, FR-012-01 … FR-012-04, FR-012-16) in blokade izbrisa. Poti nimajo identifikatorja
 * uporabnika, zato tujega računa ni mogoče nasloviti. Blokade izbrisa: {@code 501} do implementacije US2.
 */
@RestController
@RequestMapping("/api/me")
class MyDataController {

    private final MyDataService service;

    MyDataController(MyDataService service) {
        this.service = service;
    }

    /** Posnetek podatkov prijavljenega uporabnika; ime datoteke s strežnika nosi datum po UTC (odjemalec uporabi lokalnega). */
    @GetMapping("/export")
    ResponseEntity<MyData> export(@AuthenticationPrincipal Jwt jwt) {
        MyData data = service.export(jwt);
        return ResponseEntity.ok()
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"moji-podatki-" + LocalDate.now(ZoneOffset.UTC) + ".json\"")
                .cacheControl(CacheControl.noStore())
                .header("X-Content-Type-Options", "nosniff")
                .body(data);
    }

    @GetMapping("/deletion-blockers")
    ResponseEntity<DeletionBlockers> deletionBlockers() {
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build();
    }
}
