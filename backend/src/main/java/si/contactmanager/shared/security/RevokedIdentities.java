package si.contactmanager.shared.security;

/**
 * Seznam zavrnjenih Firebase identitet (012, FR-012-15): ID žeton ne more biti razveljavljen, zato zaledje žeton
 * izbrisanega uporabnika zavrne samo prek tega seznama. Izvedba je v funkcionalnosti 012 ({@code deleted_identity}).
 */
public interface RevokedIdentities {

    boolean contains(String firebaseUid);
}
