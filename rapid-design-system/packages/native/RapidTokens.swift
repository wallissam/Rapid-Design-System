// Rapid Design System — iOS Tokens
// AUTO-GENERATED — DO NOT EDIT

import UIKit

public enum RapidTokens {

    // MARK: - Colors

    public static let brandPrimary = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.278, green: 0.620, blue: 0.961, alpha: 1)
            : UIColor(red: 0.059, green: 0.424, blue: 0.741, alpha: 1)
    }

    public static let brandSecondary = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.384, green: 0.671, blue: 0.961, alpha: 1)
            : UIColor(red: 0.067, green: 0.369, blue: 0.639, alpha: 1)
    }

    public static let brandTertiary = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.157, green: 0.525, blue: 0.871, alpha: 1)
            : UIColor(red: 0.000, green: 0.471, blue: 0.831, alpha: 1)
    }

    public static let surfaceBase = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.106, green: 0.106, blue: 0.106, alpha: 1)
            : UIColor(red: 1.000, green: 1.000, blue: 1.000, alpha: 1)
    }

    public static let surfaceRaised = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.176, green: 0.176, blue: 0.176, alpha: 1)
            : UIColor(red: 0.980, green: 0.980, blue: 0.980, alpha: 1)
    }

    public static let surfaceOverlay = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.220, green: 0.220, blue: 0.220, alpha: 1)
            : UIColor(red: 0.961, green: 0.961, blue: 0.961, alpha: 1)
    }

    public static let surfaceDisabled = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.165, green: 0.165, blue: 0.165, alpha: 1)
            : UIColor(red: 0.941, green: 0.941, blue: 0.941, alpha: 1)
    }

    public static let textPrimary = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.878, green: 0.878, blue: 0.878, alpha: 1)
            : UIColor(red: 0.141, green: 0.141, blue: 0.141, alpha: 1)
    }

    public static let textSecondary = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.678, green: 0.678, blue: 0.678, alpha: 1)
            : UIColor(red: 0.380, green: 0.380, blue: 0.380, alpha: 1)
    }

    public static let textDisabled = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.361, green: 0.361, blue: 0.361, alpha: 1)
            : UIColor(red: 0.627, green: 0.627, blue: 0.627, alpha: 1)
    }

    public static let textOnBrand = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 1.000, green: 1.000, blue: 1.000, alpha: 1)
            : UIColor(red: 1.000, green: 1.000, blue: 1.000, alpha: 1)
    }

    public static let textLink = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.278, green: 0.620, blue: 0.961, alpha: 1)
            : UIColor(red: 0.059, green: 0.424, blue: 0.741, alpha: 1)
    }

    public static let textLinkHover = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.384, green: 0.671, blue: 0.961, alpha: 1)
            : UIColor(red: 0.067, green: 0.369, blue: 0.639, alpha: 1)
    }

    public static let borderDefault = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.282, green: 0.282, blue: 0.282, alpha: 1)
            : UIColor(red: 0.820, green: 0.820, blue: 0.820, alpha: 1)
    }

    public static let borderStrong = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.416, green: 0.416, blue: 0.416, alpha: 1)
            : UIColor(red: 0.671, green: 0.671, blue: 0.671, alpha: 1)
    }

    public static let focusRing = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.278, green: 0.620, blue: 0.961, alpha: 1)
            : UIColor(red: 0.059, green: 0.424, blue: 0.741, alpha: 1)
    }

    public static let statusInfo = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.278, green: 0.620, blue: 0.961, alpha: 1)
            : UIColor(red: 0.000, green: 0.471, blue: 0.831, alpha: 1)
    }

    public static let statusSuccess = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.329, green: 0.690, blue: 0.329, alpha: 1)
            : UIColor(red: 0.055, green: 0.478, blue: 0.051, alpha: 1)
    }

    public static let statusWarning = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.976, green: 0.533, blue: 0.271, alpha: 1)
            : UIColor(red: 0.969, green: 0.388, blue: 0.047, alpha: 1)
    }

    public static let statusDanger = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.890, green: 0.306, blue: 0.369, alpha: 1)
            : UIColor(red: 0.694, green: 0.055, blue: 0.110, alpha: 1)
    }

    // MARK: - Dimensions

    public static let spacingXs: CGFloat = 4
    public static let spacingSm: CGFloat = 8
    public static let spacingMd: CGFloat = 16
    public static let spacingLg: CGFloat = 24
    public static let spacingXl: CGFloat = 32
    public static let spacing2xl: CGFloat = 48
    public static let fontSizeXs: CGFloat = 10
    public static let fontSizeSm: CGFloat = 12
    public static let fontSizeMd: CGFloat = 14
    public static let fontSizeLg: CGFloat = 18
    public static let fontSizeXl: CGFloat = 24
    public static let fontSize2xl: CGFloat = 32
    public static let fontWeightRegular: CGFloat = 400
    public static let fontWeightSemibold: CGFloat = 600
    public static let fontWeightBold: CGFloat = 700
    public static let fontLineHeightTight: CGFloat = 1.2
    public static let fontLineHeightNormal: CGFloat = 1.5
    public static let fontLineHeightRelaxed: CGFloat = 1.75
    public static let fontLetterSpacingNormal: CGFloat = 0
    public static let fontLetterSpacingWide: CGFloat = 0.05
    public static let radiusSm: CGFloat = 2
    public static let radiusMd: CGFloat = 4
    public static let radiusLg: CGFloat = 8
    public static let radiusXl: CGFloat = 12
    public static let radiusRound: CGFloat = 9999
    public static let borderWidthThin: CGFloat = 1
    public static let borderWidthThick: CGFloat = 2
    public static let focusWidth: CGFloat = 2
    public static let focusOffset: CGFloat = 2
    public static let opacityDisabled: CGFloat = 0.4
    public static let opacityHover: CGFloat = 0.9
    public static let opacitySubtle: CGFloat = 0.7
    public static let durationFast: CGFloat = 100
    public static let durationNormal: CGFloat = 200
    public static let durationSlow: CGFloat = 400
    public static let zDropdown: CGFloat = 1000
    public static let zSticky: CGFloat = 1100
    public static let zOverlay: CGFloat = 1300
    public static let zModal: CGFloat = 1400
    public static let zToast: CGFloat = 1500

}
