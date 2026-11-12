package si.contactmanager.account;

import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Obravnava napak funkcionalnosti 012 (409 OWNS_ACTIVE_GROUPS, 401). {@code ApiExceptionHandler} se ne spreminja
 * (research R-14). Preslikave pridejo z implementacijo.
 */
@RestControllerAdvice(basePackageClasses = AccountExceptionHandler.class)
class AccountExceptionHandler {}
